import {
  SmsDraftStatus,
  type Lead,
  type PrismaClient,
} from "@prisma/client";
import { ActivityType, logActivity } from "@/server/activity";
import { isSmsConfigured, sendSms } from "@/features/sms/server/twilio";

export type SmsErrorCode =
  | "NO_PHONE"
  | "INVALID_PHONE"
  | "OPTED_OUT"
  | "NOT_FOUND"
  | "ALREADY_SENT"
  | "NON_COMPLIANT"
  | "NOT_CONFIGURED"
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

export function normalizePhoneE164(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new OutreachSmsError("NO_PHONE", "Lead has no phone number.");
  }

  const allowedFormat = trimmed.startsWith("+")
    ? /^\+[\d\s().-]+$/.test(trimmed)
    : /^[\d\s().-]+$/.test(trimmed);
  if (!allowedFormat) {
    throw new OutreachSmsError(
      "INVALID_PHONE",
      "Phone number contains unsupported characters or an extension.",
    );
  }

  if (trimmed.startsWith("+")) {
    const normalized = `+${trimmed.slice(1).replace(/\D/g, "")}`;
    if (/^\+[1-9]\d{7,14}$/.test(normalized)) return normalized;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `+1${digits}`;
  if (/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `+${digits}`;

  throw new OutreachSmsError(
    "INVALID_PHONE",
    "Phone number must be a valid E.164 or US phone number.",
  );
}

function assertCompliantBody(body: string): void {
  const senderName = process.env.SENDER_NAME?.trim() || "ClientCore";
  const lines = body.trimEnd().split(/\r?\n/);
  if (!body.includes(senderName)) {
    throw new OutreachSmsError(
      "NON_COMPLIANT",
      `SMS body must identify the sender as ${senderName}.`,
    );
  }
  if (lines.at(-1) !== "Reply STOP to opt out") {
    throw new OutreachSmsError(
      "NON_COMPLIANT",
      'SMS body must end with "Reply STOP to opt out".',
    );
  }
}

function demoUrl(slug: string): string {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim()
  )?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new OutreachSmsError(
      "NOT_CONFIGURED",
      "NEXT_PUBLIC_APP_URL or NEXTAUTH_URL is required to include the demo link.",
    );
  }
  return `${baseUrl}/demo/${slug}`;
}

function draftBody(lead: Lead, websiteSlug?: string | null): string {
  const greeting = lead.firstName?.trim() || "there";
  const senderName = process.env.SENDER_NAME?.trim() || "ClientCore";
  const company = lead.company?.trim() || "your business";
  const pitch = websiteSlug
    ? `I put together a quick website demo for ${company}: ${demoUrl(websiteSlug)}`
    : `I'd love to show you a quick website idea for ${company}.`;

  return `Hi ${greeting}, this is ${senderName}. ${pitch}\n\nReply STOP to opt out`;
}

async function assertPhoneNotOptedOut(
  prisma: PrismaClient,
  phone: string,
  organizationId: string,
): Promise<void> {
  const optOut = await prisma.phoneOptOut.findUnique({
    where: { phone_organizationId: { phone, organizationId } },
    select: { id: true },
  });
  if (optOut) {
    throw new OutreachSmsError("OPTED_OUT", "This phone number has opted out.");
  }
}

export async function generateDraftForLead(
  prisma: PrismaClient,
  lead: Lead,
  opts: { organizationId: string; userId: string },
): Promise<{ draftId: string }> {
  if (!lead.phone) {
    throw new OutreachSmsError("NO_PHONE", "Lead has no phone number.");
  }
  const phone = normalizePhoneE164(lead.phone);

  await assertPhoneNotOptedOut(prisma, phone, opts.organizationId);

  const website = await prisma.generatedWebsite.findFirst({
    where: {
      leadId: lead.id,
      lead: { organizationId: opts.organizationId },
      slug: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true },
  });
  const body = draftBody(lead, website?.slug);

  const existing = await prisma.smsDraft.findFirst({
    where: {
      leadId: lead.id,
      organizationId: opts.organizationId,
      status: SmsDraftStatus.DRAFT,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (existing) {
    const updated = await prisma.smsDraft.update({
      where: { id: existing.id, organizationId: opts.organizationId },
      data: { body, toPhone: phone, websiteId: website?.id ?? null },
    });
    return { draftId: updated.id };
  }

  const created = await prisma.smsDraft.create({
    data: {
      leadId: lead.id,
      organizationId: opts.organizationId,
      websiteId: website?.id ?? null,
      toPhone: phone,
      body,
    },
  });

  await logActivity(prisma, {
    leadId: lead.id,
    userId: opts.userId,
    type: ActivityType.SMS_DRAFT_CREATED,
    description: "SMS draft generated",
    organizationId: opts.organizationId,
  });

  return { draftId: created.id };
}

export async function sendDraft(
  prisma: PrismaClient,
  opts: { draftId: string; organizationId: string; userId: string },
): Promise<{ messageId: string }> {
  if (!isSmsConfigured()) {
    throw new OutreachSmsError(
      "NOT_CONFIGURED",
      "Twilio SMS is not configured for this workspace.",
    );
  }

  const draft = await prisma.smsDraft.findFirst({
    where: { id: opts.draftId, organizationId: opts.organizationId },
    include: { lead: { select: { id: true } } },
  });
  if (!draft) throw new OutreachSmsError("NOT_FOUND", "SMS draft not found.");
  if (draft.status !== SmsDraftStatus.DRAFT) {
    throw new OutreachSmsError("ALREADY_SENT", "SMS draft was already sent.");
  }
  const phone = normalizePhoneE164(draft.toPhone);
  await assertPhoneNotOptedOut(prisma, phone, opts.organizationId);
  assertCompliantBody(draft.body);

  const claim = await prisma.smsDraft.updateMany({
    where: {
      id: opts.draftId,
      organizationId: opts.organizationId,
      status: SmsDraftStatus.DRAFT,
    },
    data: { status: SmsDraftStatus.SENDING },
  });
  if (claim.count !== 1) {
    throw new OutreachSmsError("ALREADY_SENT", "SMS draft was already sent.");
  }

  let messageSid: string;
  try {
    ({ messageSid } = await sendSms({ to: phone, body: draft.body }));
  } catch (error) {
    await prisma.smsDraft.updateMany({
      where: {
        id: opts.draftId,
        organizationId: opts.organizationId,
        status: SmsDraftStatus.SENDING,
      },
      data: { status: SmsDraftStatus.DRAFT },
    });
    throw new OutreachSmsError(
      "SEND_FAILED",
      error instanceof Error ? error.message : "Failed to send SMS.",
    );
  }

  await prisma.smsDraft.update({
    where: {
      id: opts.draftId,
      organizationId: opts.organizationId,
      status: SmsDraftStatus.SENDING,
    },
    data: {
      status: SmsDraftStatus.SENT,
      twilioMessageSid: messageSid,
      sentAt: new Date(),
    },
  });
  await prisma.smsEvent.create({
    data: {
      draftId: opts.draftId,
      organizationId: opts.organizationId,
      event: "sent",
      data: { twilio_message_sid: messageSid },
    },
  });
  await logActivity(prisma, {
    leadId: draft.leadId,
    userId: opts.userId,
    type: ActivityType.SMS_SENT,
    description: `Outreach SMS sent to ${phone}`,
    organizationId: opts.organizationId,
  });

  return { messageId: messageSid };
}
