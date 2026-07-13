import twilio from "twilio";

type SendSmsInput = {
  to: string;
  body: string;
};

function smsConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const senderName = process.env.SENDER_NAME?.trim();

  if (!accountSid || !authToken || !messagingServiceSid || !senderName) return null;
  return { accountSid, authToken, messagingServiceSid };
}

export function isSmsConfigured(): boolean {
  return smsConfig() !== null;
}

export async function sendSms(input: SendSmsInput): Promise<{ messageSid: string }> {
  const config = smsConfig();
  if (!config) {
    throw new Error(
      "Twilio SMS requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID, and SENDER_NAME.",
    );
  }

  const client = twilio(config.accountSid, config.authToken);
  const message = await client.messages.create({
    to: input.to,
    body: input.body,
    messagingServiceSid: config.messagingServiceSid,
  });

  return { messageSid: message.sid };
}
