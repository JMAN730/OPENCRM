import { Webhook } from "svix";
import { prisma } from "@/lib/prisma";
import { EmailDraftStatus } from "@prisma/client";
import { isUniqueConstraintError } from "@/lib/prismaErrors";

const STATUS_MAP: Record<string, EmailDraftStatus> = {
  "email.opened": EmailDraftStatus.OPENED,
  "email.clicked": EmailDraftStatus.CLICKED,
  "email.bounced": EmailDraftStatus.BOUNCED,
  "email.complained": EmailDraftStatus.COMPLAINED,
};

const UPGRADE_GUARD: Partial<Record<EmailDraftStatus, EmailDraftStatus[]>> = {
  [EmailDraftStatus.OPENED]: [EmailDraftStatus.SENT],
  [EmailDraftStatus.CLICKED]: [EmailDraftStatus.SENT, EmailDraftStatus.OPENED],
  // A hard bounce only makes sense at delivery time; a late "bounce" arriving
  // after the recipient already engaged must not downgrade OPENED/CLICKED.
  [EmailDraftStatus.BOUNCED]: [EmailDraftStatus.SENT],
  // A spam complaint can legitimately follow engagement, so allow it from any
  // pre-terminal status — but still never overwrite a prior BOUNCED/COMPLAINED.
  [EmailDraftStatus.COMPLAINED]: [
    EmailDraftStatus.SENT,
    EmailDraftStatus.OPENED,
    EmailDraftStatus.CLICKED,
  ],
};

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const body = await req.text();
  const svixId = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";

  const wh = new Webhook(secret);
  let payload: { type: string; data: Record<string, unknown> };
  try {
    payload = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof payload;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const resendMessageId = payload.data?.email_id as string | undefined;
  if (!resendMessageId) return new Response("OK");

  const newStatus = STATUS_MAP[payload.type];
  if (!newStatus) return new Response("OK");

  const draft = await prisma.emailDraft.findFirst({
    where: { resendMessageId },
    select: { id: true, status: true },
  });
  if (!draft) return new Response("OK");

  const allowedFromStatuses = UPGRADE_GUARD[newStatus];
  if (!allowedFromStatuses || allowedFromStatuses.includes(draft.status)) {
    await prisma.emailDraft.update({
      where: { id: draft.id },
      data: { status: newStatus },
    });
  }

  // Svix/Resend deliver at-least-once, so a transient failure triggers a retry
  // that re-delivers the same signed payload. Dedup on the svix-id (unique
  // column) so a redelivery doesn't append a duplicate audit row. The status
  // update above is already idempotent via UPGRADE_GUARD.
  if (svixId) {
    const seen = await prisma.emailEvent.findFirst({
      where: { svixId },
      select: { id: true },
    });
    if (seen) return new Response("OK");
  }

  try {
    await prisma.emailEvent.create({
      data: {
        draftId: draft.id,
        event: payload.type,
        svixId: svixId || null,
        data: payload.data as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Concurrent retries can race past the pre-check; the unique constraint is
    // the backstop. Swallow the duplicate-key error so the retry still 200s.
    if (isUniqueConstraintError(err)) {
      return new Response("OK");
    }
    throw err;
  }

  return new Response("OK");
}
