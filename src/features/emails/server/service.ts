import { Resend } from "resend";
import { nanoid } from "nanoid";
import { EmailDraftStatus, type Lead, type PrismaClient } from "@prisma/client";
import { generateEmailCopy } from "@/lib/ai";
import { trackedDemoUrl, unsubscribeUrl, validateCanSpam } from "@/lib/can-spam";
import { logActivity, ActivityType } from "@/server/activity";

export type OutreachErrorCode =
  | "NO_EMAIL"
  | "OPTED_OUT"
  | "NOT_FOUND"
  | "ALREADY_SENT"
  | "CAN_SPAM"
  | "SEND_FAILED";

/**
 * Thrown by the email services for expected business failures so callers
 * (tRPC routers, the outreach worker) can map them to their own error types.
 */
export class OutreachEmailError extends Error {
  constructor(
    public readonly code: OutreachErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OutreachEmailError";
  }
}

function resendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * Generates (or regenerates) the outreach email draft for a lead. Shared by
 * the `emails.generate` mutation and the outreach cron worker — callers are
 * responsible for rate limiting and for loading the lead org-scoped.
 */
export async function generateDraftForLead(
  prisma: PrismaClient,
  lead: Lead,
  opts: { organizationId: string; userId: string },
): Promise<{ draftId: string }> {
  if (!lead.email) {
    throw new OutreachEmailError("NO_EMAIL", "Lead has no email address.");
  }

  const optOut = await prisma.emailOptOut.findUnique({
    where: { email_organizationId: { email: lead.email, organizationId: opts.organizationId } },
    select: { id: true },
  });
  if (optOut) {
    throw new OutreachEmailError("OPTED_OUT", "This email address has opted out.");
  }

  const website = await prisma.generatedWebsite.findFirst({
    where: { leadId: lead.id, slug: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true },
  });

  const existing = await prisma.emailDraft.findFirst({
    where: { leadId: lead.id, organizationId: opts.organizationId, status: EmailDraftStatus.DRAFT },
    orderBy: { createdAt: "desc" },
    select: { id: true, unsubscribeToken: true },
  });

  const copy = await generateEmailCopy(lead);

  const unsubToken = existing?.unsubscribeToken ?? nanoid(32);
  const unsub = unsubscribeUrl(unsubToken);
  const ownerName = lead.firstName ? `${lead.firstName}` : "there";
  const niche = lead.source ?? "local business";
  const city = lead.city ?? "your area";
  const physicalAddress = process.env.SENDER_PHYSICAL_ADDRESS ?? "";
  const senderName = process.env.SENDER_NAME ?? "OpenCRM";

  const demoLine = website?.slug
    ? `Here's the demo:\n${trackedDemoUrl(unsubToken)}\n\nNo pressure — I just wanted to show you what I had in mind before reaching out.\n\nWould you be open to me making a few changes and showing you how it could help bring in more jobs?`
    : "No pressure — I just wanted to show you what I had in mind before reaching out.\n\nWould you be open to me making a few changes and showing you how it could help bring in more jobs?";

  const body = `Hey ${ownerName},

I came across ${lead.company ?? "your business"} while looking at ${niche} businesses in ${city}.

I noticed ${copy.observation}, so I put together a quick demo website showing how you could look online and potentially turn more Google visitors into calls.

${demoLine}

${senderName}

${physicalAddress}
Unsubscribe: ${unsub}`;

  if (existing) {
    const updated = await prisma.emailDraft.update({
      where: { id: existing.id },
      data: {
        subject: copy.subject,
        body,
        websiteId: website?.id ?? null,
      },
    });
    return { draftId: updated.id };
  }

  const created = await prisma.emailDraft.create({
    data: {
      leadId: lead.id,
      organizationId: opts.organizationId,
      websiteId: website?.id ?? null,
      subject: copy.subject,
      body,
      unsubscribeToken: unsubToken,
    },
  });

  void logActivity(prisma, {
    leadId: lead.id,
    userId: opts.userId,
    type: ActivityType.EMAIL_DRAFT_CREATED,
    description: `Email draft generated`,
    organizationId: opts.organizationId,
  });

  return { draftId: created.id };
}

/**
 * Sends an existing draft via Resend, enforcing opt-out and CAN-SPAM checks.
 * Shared by the `emails.send` mutation and `outreach.bulkSend` — callers are
 * responsible for rate limiting.
 */
export async function sendDraft(
  prisma: PrismaClient,
  opts: { draftId: string; organizationId: string; userId: string },
): Promise<{ messageId: string }> {
  const draft = await prisma.emailDraft.findFirst({
    where: { id: opts.draftId, organizationId: opts.organizationId },
    include: { lead: { select: { id: true, email: true, company: true, firstName: true } } },
  });
  if (!draft) throw new OutreachEmailError("NOT_FOUND", "Draft not found.");
  if (draft.status !== EmailDraftStatus.DRAFT) {
    throw new OutreachEmailError("ALREADY_SENT", "Email already sent.");
  }

  const toEmail = draft.lead.email;
  if (!toEmail) {
    throw new OutreachEmailError("NO_EMAIL", "Lead has no email address.");
  }

  const optOut = await prisma.emailOptOut.findUnique({
    where: { email_organizationId: { email: toEmail, organizationId: opts.organizationId } },
    select: { id: true },
  });
  if (optOut) {
    throw new OutreachEmailError("OPTED_OUT", "This email address has opted out.");
  }

  const physicalAddress = process.env.SENDER_PHYSICAL_ADDRESS ?? "";
  const canSpamErrors = validateCanSpam({
    subject: draft.subject,
    body: draft.body,
    physicalAddress,
    unsubscribeUrl: unsubscribeUrl(draft.unsubscribeToken),
  });
  if (canSpamErrors.length > 0) {
    throw new OutreachEmailError("CAN_SPAM", canSpamErrors.join(" "));
  }

  const senderName = process.env.SENDER_NAME ?? "OpenCRM";
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "";

  const r = resendClient();
  const { data: sent, error: sendError } = await r.emails.send({
    from: `${senderName} <${fromEmail}>`,
    to: [toEmail],
    subject: draft.subject,
    text: draft.body,
  });

  if (sendError || !sent?.id) {
    throw new OutreachEmailError(
      "SEND_FAILED",
      (sendError as { message?: string } | null)?.message ?? "Failed to send email.",
    );
  }

  await prisma.emailDraft.update({
    where: { id: opts.draftId },
    data: { status: EmailDraftStatus.SENT, resendMessageId: sent.id, sentAt: new Date() },
  });

  await prisma.emailEvent.create({
    data: { draftId: opts.draftId, event: "sent", data: { resend_id: sent.id } },
  });

  void logActivity(prisma, {
    leadId: draft.leadId,
    userId: opts.userId,
    type: ActivityType.EMAIL_SENT,
    description: `Outreach email sent to ${toEmail}`,
    organizationId: opts.organizationId,
  });

  return { messageId: sent.id };
}
