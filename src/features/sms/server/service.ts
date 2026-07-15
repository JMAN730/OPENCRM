import { SmsDraftStatus, type Lead, type PrismaClient } from "@prisma/client";
import { ActivityType, logActivity } from "@/server/activity";
import { isUniqueConstraintError } from "@/lib/prismaErrors";
import { isSmsConfigured, sendSmsMessage } from "./twilio";
import { appBaseUrl } from "@/lib/appUrl";

export type SmsErrorCode =
  | "NO_PHONE"
  | "INVALID_PHONE"
  | "OPTED_OUT"
  | "NO_WEBSITE"
  | "NOT_CONFIGURED"
  | "NOT_FOUND"
  | "ALREADY_SENT"
  | "SEND_FAILED";

export class OutreachSmsError extends Error {
  constructor(
    public readonly code: SmsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OutreachSmsError";
  }
}

/** Plausible E.164: "+", non-zero leading digit, 8–15 digits total. */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
/** Trailing extension ("ext. 89", "extension 89", "x89", "#89") — its digits must never be folded into the subscriber number. */
const EXTENSION_PATTERN = /[\s.,;:-]*(?:extension|ext\.?|x|#)[\s.]*\d+\s*$/i;

/** Normalize common North American and already-international values to E.164. */
export function normalizePhoneNumber(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim().replace(EXTENSION_PATTERN, "").trim();
  const digits = trimmed.replace(/\D/g, "");
  let candidate: string | null = null;
  // Explicit international prefixes take priority — a "+354…" number with ten
  // digits must never be reinterpreted as NANP and given a "+1".
  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    candidate = `+${digits}`;
  } else if (trimmed.startsWith("00") && digits.length >= 10 && digits.length <= 17) {
    candidate = `+${digits.slice(2)}`;
  } else if (digits.length === 10) {
    candidate = `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    candidate = `+${digits}`;
  }
  return candidate !== null && E164_PATTERN.test(candidate) ? candidate : null;
}

function demoUrl(slug: string): string {
  return `${appBaseUrl()}/demo/${slug}`;
}

function isTwilioBlockedRecipient(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 21610
  );
}

export async function generateSmsDraftForLead(
  prisma: PrismaClient,
  lead: Lead,
  opts: { organizationId: string; userId: string },
): Promise<{ draftId: string }> {
  if (!isSmsConfigured()) {
    throw new OutreachSmsError("NOT_CONFIGURED", "Twilio SMS is not configured.");
  }
  const senderName = process.env.SENDER_NAME?.trim();
  if (!senderName) {
    throw new OutreachSmsError("NOT_CONFIGURED", "SENDER_NAME must be set for SMS outreach.");
  }
  if (!lead.phone) throw new OutreachSmsError("NO_PHONE", "Lead has no phone number.");
  const toPhone = normalizePhoneNumber(lead.phone);
  if (!toPhone) throw new OutreachSmsError("INVALID_PHONE", "Lead phone number is invalid.");

  const optOut = await prisma.phoneOptOut.findUnique({
    where: { phone_organizationId: { phone: toPhone, organizationId: opts.organizationId } },
    select: { id: true },
  });
  if (optOut) throw new OutreachSmsError("OPTED_OUT", "This phone number has opted out.");

  const website = await prisma.generatedWebsite.findFirst({
    where: { leadId: lead.id, organizationId: opts.organizationId, slug: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true },
  });
  if (!website?.slug) {
    throw new OutreachSmsError("NO_WEBSITE", "Generate a demo website before creating an SMS draft.");
  }

  const greeting = lead.firstName?.trim() ? `Hi ${lead.firstName.trim()}` : "Hi there";
  const company = lead.company?.trim() || "your business";
  const body = `${greeting} - this is ${senderName}. I made a quick demo website for ${company}: ${demoUrl(website.slug)}\n\nReply STOP to opt out.`;

  const existing = await prisma.smsDraft.findFirst({
    where: { leadId: lead.id, organizationId: opts.organizationId, status: SmsDraftStatus.DRAFT },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    const updated = await prisma.smsDraft.update({
      where: { id: existing.id },
      data: { body, toPhone, websiteId: website.id },
    });
    return { draftId: updated.id };
  }

  let created;
  try {
    created = await prisma.smsDraft.create({
      data: {
        leadId: lead.id,
        organizationId: opts.organizationId,
        websiteId: website.id,
        toPhone,
        body,
      },
    });
  } catch (error) {
    // A concurrent call (worker tick + user click) can win the race between
    // findFirst and create; the partial unique index on (leadId) WHERE
    // status = 'DRAFT' turns that into P2002 — converge on the surviving
    // draft instead of duplicating.
    if (!isUniqueConstraintError(error)) throw error;
    const winner = await prisma.smsDraft.findFirst({
      where: { leadId: lead.id, organizationId: opts.organizationId, status: SmsDraftStatus.DRAFT },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!winner) throw error;
    const updated = await prisma.smsDraft.update({
      where: { id: winner.id },
      data: { body, toPhone, websiteId: website.id },
    });
    return { draftId: updated.id };
  }
  void logActivity(prisma, {
    leadId: lead.id,
    userId: opts.userId,
    organizationId: opts.organizationId,
    type: ActivityType.SMS_DRAFT_CREATED,
    description: "SMS draft generated",
  });
  return { draftId: created.id };
}

export async function sendSmsDraft(
  prisma: PrismaClient,
  opts: { draftId: string; organizationId: string; userId: string },
): Promise<{ messageId: string }> {
  if (!isSmsConfigured()) {
    throw new OutreachSmsError("NOT_CONFIGURED", "Twilio SMS is not configured.");
  }
  const draft = await prisma.smsDraft.findFirst({
    where: { id: opts.draftId, organizationId: opts.organizationId },
    include: { lead: { select: { id: true, company: true, phone: true } } },
  });
  if (!draft) throw new OutreachSmsError("NOT_FOUND", "SMS draft not found.");
  if (draft.status !== SmsDraftStatus.DRAFT) {
    throw new OutreachSmsError("ALREADY_SENT", "SMS draft has already been sent.");
  }

  // Send to the lead's current phone, not the destination captured when the
  // draft was generated — the lead may have been edited since.
  if (!draft.lead.phone) {
    throw new OutreachSmsError("NO_PHONE", "Lead no longer has a phone number.");
  }
  const toPhone = normalizePhoneNumber(draft.lead.phone);
  if (!toPhone) throw new OutreachSmsError("INVALID_PHONE", "Lead phone number is invalid.");

  const optOut = await prisma.phoneOptOut.findUnique({
    where: {
      phone_organizationId: {
        phone: toPhone,
        organizationId: opts.organizationId,
      },
    },
    select: { id: true },
  });
  if (optOut) throw new OutreachSmsError("OPTED_OUT", "This phone number has opted out.");

  // Reserve the draft before crossing the network boundary. Only one caller
  // can transition DRAFT -> SENT, which prevents concurrent single/bulk sends
  // from delivering the same message twice.
  const claimed = await prisma.smsDraft.updateMany({
    where: {
      id: draft.id,
      organizationId: opts.organizationId,
      status: SmsDraftStatus.DRAFT,
    },
    data: { status: SmsDraftStatus.SENT },
  });
  if (claimed.count !== 1) {
    throw new OutreachSmsError("ALREADY_SENT", "SMS draft has already been sent.");
  }

  let sent: { messageSid: string };
  try {
    sent = await sendSmsMessage({ to: toPhone, body: draft.body, draftId: draft.id });
  } catch (error) {
    await prisma.smsDraft.updateMany({
      where: {
        id: draft.id,
        status: SmsDraftStatus.SENT,
        twilioMessageSid: null,
      },
      data: { status: SmsDraftStatus.DRAFT },
    });
    // Twilio 21610: the recipient unsubscribed at the Messaging Service level.
    // Mirror it into the org-scoped opt-out list so the draft is not retried
    // against a number Twilio will always reject.
    if (isTwilioBlockedRecipient(error)) {
      await prisma.phoneOptOut.upsert({
        where: {
          phone_organizationId: { phone: toPhone, organizationId: opts.organizationId },
        },
        create: { phone: toPhone, organizationId: opts.organizationId },
        update: {},
      });
      throw new OutreachSmsError("OPTED_OUT", "This phone number has opted out.");
    }
    throw new OutreachSmsError(
      "SEND_FAILED",
      error instanceof Error ? error.message : "Failed to send SMS.",
    );
  }

  await prisma.smsDraft.update({
    where: { id: draft.id },
    data: {
      toPhone,
      twilioMessageSid: sent.messageSid,
      sentAt: new Date(),
    },
  });
  await prisma.smsEvent.upsert({
    where: { dedupKey: `${sent.messageSid}:sent` },
    create: {
      draftId: draft.id,
      event: "sent",
      dedupKey: `${sent.messageSid}:sent`,
      data: { messageSid: sent.messageSid },
    },
    update: {},
  });
  void logActivity(prisma, {
    leadId: draft.leadId,
    userId: opts.userId,
    organizationId: opts.organizationId,
    type: ActivityType.SMS_SENT,
    description: `Outreach SMS sent to ${toPhone}`,
  });
  return { messageId: sent.messageSid };
}
