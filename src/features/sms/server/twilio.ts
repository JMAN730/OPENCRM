import twilio from "twilio";
import { appBaseUrl } from "@/lib/appUrl";

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_MESSAGING_SERVICE_SID &&
      process.env.SENDER_NAME?.trim(),
  );
}

export function smsStatusCallbackUrl(draftId?: string): string {
  const url = `${appBaseUrl()}/api/webhooks/twilio/status`;
  return draftId ? `${url}?draftId=${encodeURIComponent(draftId)}` : url;
}

export async function sendSmsMessage(input: {
  to: string;
  body: string;
  draftId: string;
}): Promise<{ messageSid: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new Error("Twilio SMS is not configured.");
  }

  // Bound the user-facing send path instead of relying on the SDK default.
  const message = await twilio(accountSid, authToken, { timeout: 10_000 }).messages.create({
    to: input.to,
    body: input.body,
    messagingServiceSid,
    statusCallback: smsStatusCallbackUrl(input.draftId),
  });
  return { messageSid: message.sid };
}

export function validateTwilioWebhook(input: {
  signature: string;
  url: string;
  params: Record<string, string>;
}): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;
  return twilio.validateRequest(authToken, input.signature, input.url, input.params);
}
