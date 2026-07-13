import { afterEach, describe, expect, it, vi } from "vitest";
import twilio from "twilio";
import { isSmsConfigured, sendSms } from "./twilio";

vi.mock("twilio", () => ({ default: vi.fn() }));

const twilioMock = vi.mocked(twilio);

function stubTwilioEnv() {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG123");
}

describe("isSmsConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when the Twilio values and SENDER_NAME are set", () => {
    stubTwilioEnv();
    vi.stubEnv("SENDER_NAME", "Maya's Web Studio");

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
    vi.stubEnv("SENDER_NAME", "Maya's Web Studio");

    expect(isSmsConfigured()).toBe(false);
  });
});

describe("sendSms", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to send when SENDER_NAME is missing", async () => {
    stubTwilioEnv();
    vi.stubEnv("SENDER_NAME", "");

    await expect(sendSms({ to: "+18135550199", body: "Hello" })).rejects.toThrow(
      "Twilio SMS requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID, and SENDER_NAME.",
    );
  });

  it("sends through the Messaging Service and surfaces the message sid", async () => {
    stubTwilioEnv();
    vi.stubEnv("SENDER_NAME", "Maya's Web Studio");
    const create = vi.fn().mockResolvedValue({ sid: "SM123" });
    twilioMock.mockReturnValue({
      messages: { create },
    } as unknown as ReturnType<typeof twilio>);

    const result = await sendSms({ to: "+18135550199", body: "Hello" });

    expect(twilioMock).toHaveBeenCalledWith("AC123", "token", { timeout: 10_000 });
    expect(create).toHaveBeenCalledWith({
      to: "+18135550199",
      body: "Hello",
      messagingServiceSid: "MG123",
    });
    expect(result).toEqual({ messageSid: "SM123" });
  });
});
