import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockValidate } = vi.hoisted(() => ({
  mockPrisma: {
    smsDraft: { findFirst: vi.fn() },
    smsEvent: { findFirst: vi.fn(), create: vi.fn() },
    phoneOptOut: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
  mockValidate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/features/sms/server/twilio", () => ({
  validateTwilioWebhook: mockValidate,
  isSmsConfigured: vi.fn(),
  sendSmsMessage: vi.fn(),
}));

import { POST } from "./route";

function request(body: Record<string, string>) {
  return new Request("https://crm.example.com/api/webhooks/twilio/inbound", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "valid-signature",
    },
    body: new URLSearchParams(body).toString(),
  });
}

describe("Twilio inbound SMS webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = "token";
    mockValidate.mockReturnValue(true);
    mockPrisma.smsEvent.findFirst.mockResolvedValue(null);
    mockPrisma.smsEvent.create.mockResolvedValue({});
    mockPrisma.smsDraft.findFirst.mockResolvedValue({
      id: "sms-1",
      organizationId: "org-1",
    });
  });

  it("returns a controlled 400 for a body formData() cannot parse", async () => {
    const response = await POST(
      new Request("https://crm.example.com/api/webhooks/twilio/inbound", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockPrisma.phoneOptOut.upsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid Twilio signature", async () => {
    mockValidate.mockReturnValue(false);
    const response = await POST(
      request({ From: "+15552345678", Body: "STOP", MessageSid: "SM-in-1" }),
    );
    expect(response.status).toBe(403);
    expect(mockPrisma.phoneOptOut.upsert).not.toHaveBeenCalled();
  });

  it("mirrors STOP as an organization-scoped permanent opt-out", async () => {
    const response = await POST(
      request({ From: "+1 (555) 234-5678", Body: "STOP", MessageSid: "SM-in-1" }),
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.phoneOptOut.upsert).toHaveBeenCalledWith({
      where: { phone_organizationId: { phone: "+15552345678", organizationId: "org-1" } },
      create: { phone: "+15552345678", organizationId: "org-1" },
      update: {},
    });
    expect(mockPrisma.smsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dedupKey: "inbound:SM-in-1", event: "inbound.stop" }),
      }),
    );
  });

  it.each(["Stop.", "Stop!", "  stop,  please"])(
    "treats %s as an opt-out despite punctuation and casing",
    async (body) => {
      await POST(request({ From: "+15552345678", Body: body, MessageSid: "SM-in-punct" }));

      expect(mockPrisma.phoneOptOut.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { phone: "+15552345678", organizationId: "org-1" },
        }),
      );
    },
  );

  it("honors an explicit Advanced Opt-Out OptOutType over body matching", async () => {
    await POST(
      request({
        From: "+15552345678",
        Body: "Por favor, no más mensajes",
        OptOutType: "STOP",
        MessageSid: "SM-in-oot",
      }),
    );

    expect(mockPrisma.phoneOptOut.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { phone: "+15552345678", organizationId: "org-1" },
      }),
    );
  });

  it("does not opt out on a HELP OptOutType even if the body starts with stop-like text", async () => {
    await POST(
      request({
        From: "+15552345678",
        Body: "STOP",
        OptOutType: "HELP",
        MessageSid: "SM-in-help",
      }),
    );

    expect(mockPrisma.phoneOptOut.upsert).not.toHaveBeenCalled();
  });

  it("removes the local opt-out on START", async () => {
    await POST(request({ From: "+15552345678", Body: "START", MessageSid: "SM-in-2" }));
    expect(mockPrisma.phoneOptOut.deleteMany).toHaveBeenCalledWith({
      where: { phone: "+15552345678", organizationId: "org-1" },
    });
  });

  it("changes opt-out state only for the most recent outbound organization", async () => {
    mockPrisma.smsDraft.findFirst.mockResolvedValue({
      id: "sms-latest",
      organizationId: "org-latest",
    });

    await POST(request({ From: "+15552345678", Body: "STOP", MessageSid: "SM-in-3" }));

    expect(mockPrisma.phoneOptOut.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.phoneOptOut.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { phone: "+15552345678", organizationId: "org-latest" },
      }),
    );
    expect(mockPrisma.smsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ draftId: "sms-latest" }) }),
    );
  });

  it("deduplicates a redelivered inbound message", async () => {
    mockPrisma.smsEvent.findFirst.mockResolvedValue({ id: "event-1" });
    await POST(request({ From: "+15552345678", Body: "STOP", MessageSid: "SM-in-1" }));
    expect(mockPrisma.phoneOptOut.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.smsEvent.create).not.toHaveBeenCalled();
  });
});
