import { afterEach, describe, expect, it, vi } from "vitest";
import { isSmsConfigured, sendSms } from "./twilio";

vi.mock("twilio", () => ({ default: vi.fn() }));

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
});
