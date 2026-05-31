import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

// Public endpoint — Twilio posts here when a browser Device places an outbound call.
// When TWILIO_AUTH_TOKEN is configured, every request must carry a valid X-Twilio-Signature
// to prevent toll fraud from unauthenticated callers.
export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  const body = await request.formData();
  const params: Record<string, string> = {};
  body.forEach((value, key) => {
    params[key] = String(value);
  });

  if (authToken) {
    const twilioSig = request.headers.get("x-twilio-signature") ?? "";
    // NEXTAUTH_URL must exactly match the scheme+host of the Twilio webhook URL
    // (e.g. "https://yourapp.com" — no trailing slash). Falls back to the
    // request's own protocol+host (works locally; may differ behind a proxy).
    const baseUrl =
      process.env.NEXTAUTH_URL ??
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    // Include path + query string — Twilio signs the exact URL it called.
    const url = `${baseUrl}${request.nextUrl.pathname}${request.nextUrl.search}`;

    const valid = twilio.validateRequest(authToken, twilioSig, url, params);
    if (!valid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const to = params["To"] ?? null;
  const callerIdNumber = process.env.TWILIO_PHONE_NUMBER;

  const twiml = new twilio.twiml.VoiceResponse();

  if (to && callerIdNumber) {
    const dial = twiml.dial({ callerId: callerIdNumber });
    dial.number(to);
  } else {
    twiml.say("This call could not be connected.");
  }

  return new NextResponse(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
