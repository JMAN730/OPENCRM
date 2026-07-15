import { afterEach, describe, expect, it, vi } from "vitest";
import twilio from "twilio";
import { isSmsConfigured, sendSmsMessage } from "./twilio";

vi.mock("twilio", () => {
  const mock = vi.fn();
  return { default: Object.assign(mock, { validateRequest: vi.fn() }) };
});

const twilioMock = vi.mocked(twilio);

function stubTwilioEnv() {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG123");
  vi.stubEnv("NEXTAUTH_URL", "https://crm.example.com");
}

describe("isSmsConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when the Twilio values and SENDER_NAME are set", () => {
    stubTwilioEnv();
    vi.stubEnv("SENDER_NAME", "Opulence");

    expect(isSmsConfigured()).toBe(true);
  });

  it("returns false when SENDER_NAME is missing even with Twilio configured", () => {
    stubTwilioEnv();
    vi.stubEnv("SENDER_NAME", "");

    expect(isSmsConfigured()).toBe(false);
  });

  it("returns false when a Twilio value is missing", () => {
    stubTwilioEnv();
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("SENDER_NAME", "Opulence");

    expect(isSmsConfigured()).toBe(false);
  });
});

describe("sendSmsMessage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("refuses to send when Twilio is not configured", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");

    await expect(
      sendSmsMessage({ to: "+18135550199", body: "Hello", draftId: "sms-1" }),
    ).rejects.toThrow("Twilio SMS is not configured.");
  });

  it("sends through the Messaging Service with a bounded timeout and surfaces the sid", async () => {
    stubTwilioEnv();
    const create = vi.fn().mockResolvedValue({ sid: "SM123" });
    twilioMock.mockReturnValue({
      messages: { create },
    } as unknown as ReturnType<typeof twilio>);

    const result = await sendSmsMessage({ to: "+18135550199", body: "Hello", draftId: "sms-1" });

    expect(twilioMock).toHaveBeenCalledWith("AC123", "token", { timeout: 10_000 });
    expect(create).toHaveBeenCalledWith({
      to: "+18135550199",
      body: "Hello",
      messagingServiceSid: "MG123",
      statusCallback: "https://crm.example.com/api/webhooks/twilio/status?draftId=sms-1",
    });
    expect(result).toEqual({ messageSid: "SM123" });
  });
});
