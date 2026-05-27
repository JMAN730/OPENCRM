import { Webhook } from "svix";
import { prisma } from "@/lib/prisma";
import { EmailDraftStatus } from "@prisma/client";

const STATUS_MAP: Record<string, EmailDraftStatus> = {
  "email.opened": EmailDraftStatus.OPENED,
  "email.clicked": EmailDraftStatus.CLICKED,
  "email.bounced": EmailDraftStatus.BOUNCED,
  "email.complained": EmailDraftStatus.COMPLAINED,
};

const UPGRADE_GUARD: Partial<Record<EmailDraftStatus, EmailDraftStatus[]>> = {
  [EmailDraftStatus.OPENED]: [EmailDraftStatus.SENT],
  [EmailDraftStatus.CLICKED]: [EmailDraftStatus.SENT, EmailDraftStatus.OPENED],
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

  await prisma.emailEvent.create({
    data: { draftId: draft.id, event: payload.type, data: payload.data as unknown as import("@prisma/client").Prisma.InputJsonValue },
  });

  return new Response("OK");
}
