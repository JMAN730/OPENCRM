import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/features/sms/server/service";
import { isPrismaUniqueError, verifiedTwilioForm } from "@/features/sms/server/webhook";

const STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_KEYWORDS = new Set(["START", "UNSTOP"]);

export async function POST(request: Request) {
  const verified = await verifiedTwilioForm(request);
  if (!verified.ok) return verified.response;

  const { params } = verified;
  const phone = normalizePhoneNumber(params.From);
  const messageSid = params.MessageSid ?? params.SmsMessageSid;
  if (!phone || !messageSid) return new Response("OK");

  const dedupKey = `inbound:${messageSid}`;
  const existingEvent = await prisma.smsEvent.findFirst({
    where: { dedupKey },
    select: { id: true },
  });
  if (existingEvent) return new Response("OK");

  // A shared Messaging Service does not identify the tenant in the callback.
  // Associate the reply with the most recent outbound conversation only so a
  // recipient's reply cannot change another organization's opt-out state.
  const draft = await prisma.smsDraft.findFirst({
    where: { toPhone: phone, sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    select: { id: true, organizationId: true },
  });
  if (!draft) return new Response("OK");

  const keyword = (params.Body ?? "").trim().toUpperCase().split(/\s+/)[0] ?? "";
  let event = "inbound.received";
  if (STOP_KEYWORDS.has(keyword)) {
    event = "inbound.stop";
    await prisma.phoneOptOut.upsert({
      where: {
        phone_organizationId: { phone, organizationId: draft.organizationId },
      },
      create: { phone, organizationId: draft.organizationId },
      update: {},
    });
  } else if (START_KEYWORDS.has(keyword)) {
    event = "inbound.start";
    await prisma.phoneOptOut.deleteMany({
      where: { phone, organizationId: draft.organizationId },
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
