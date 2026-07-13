import { SmsDraftStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPrismaUniqueError, verifiedTwilioForm } from "@/features/sms/server/webhook";

const STATUS_MAP: Record<string, SmsDraftStatus> = {
  accepted: SmsDraftStatus.SENT,
  queued: SmsDraftStatus.SENT,
  sending: SmsDraftStatus.SENT,
  sent: SmsDraftStatus.SENT,
  delivered: SmsDraftStatus.DELIVERED,
  failed: SmsDraftStatus.FAILED,
  undelivered: SmsDraftStatus.FAILED,
};

export async function POST(request: Request) {
  const callbackDraftId = new URL(request.url).searchParams.get("draftId");
  const verified = await verifiedTwilioForm(request);
  if (!verified.ok) return verified.response;
  const { params } = verified;
  const messageSid = params.MessageSid ?? params.SmsSid;
  const event = (params.MessageStatus ?? params.SmsStatus ?? "").toLowerCase();
  if (!messageSid || !event) return new Response("OK");

  const dedupKey = `${messageSid}:${event}`;
  const seen = await prisma.smsEvent.findFirst({
    where: { dedupKey },
    select: { id: true },
  });
  if (seen) return new Response("OK");

  const draft = await prisma.smsDraft.findFirst({
    where: {
      OR: [
        { twilioMessageSid: messageSid },
        ...(callbackDraftId ? [{ id: callbackDraftId }] : []),
      ],
    },
    select: { id: true, status: true, twilioMessageSid: true },
  });
  if (!draft) return new Response("OK");

  const nextStatus = STATUS_MAP[event];
  if (
    nextStatus &&
    (draft.status === SmsDraftStatus.DRAFT || draft.status === SmsDraftStatus.SENT)
  ) {
    await prisma.smsDraft.update({
      where: { id: draft.id },
      data: {
        status: nextStatus,
        ...(draft.twilioMessageSid ? {} : { twilioMessageSid: messageSid }),
      },
    });
  }

  try {
    await prisma.smsEvent.create({
      data: {
        draftId: draft.id,
        event,
        dedupKey,
        data: params as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (!isPrismaUniqueError(error)) throw error;
  }
  return new Response("OK");
}
