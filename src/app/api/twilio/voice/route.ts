import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

// Public endpoint — Twilio posts here when a browser Device places an outbound call.
export async function POST(request: NextRequest) {
  const body = await request.formData();
  const to = body.get("To") as string | null;
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
