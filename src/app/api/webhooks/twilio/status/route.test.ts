import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockValidate } = vi.hoisted(() => ({
  mockPrisma: {
    smsDraft: { findFirst: vi.fn(), update: vi.fn() },
    smsEvent: { findFirst: vi.fn(), create: vi.fn() },
  },
  mockValidate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/features/sms/server/twilio", () => ({ validateTwilioWebhook: mockValidate }));

import { POST } from "./route";

function request(status: string, signature = "valid-signature", draftId?: string) {
  const query = draftId ? `?draftId=${draftId}` : "";
  return new Request(`https://crm.example.com/api/webhooks/twilio/status${query}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body: new URLSearchParams({ MessageSid: "SM123", MessageStatus: status }).toString(),
  });
}

describe("Twilio SMS status webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = "token";
    mockValidate.mockReturnValue(true);
    mockPrisma.smsDraft.findFirst.mockResolvedValue({
      id: "sms-1",
      status: "SENT",
      twilioMessageSid: "SM123",
    });
    mockPrisma.smsEvent.findFirst.mockResolvedValue(null);
    mockPrisma.smsDraft.update.mockResolvedValue({});
    mockPrisma.smsEvent.create.mockResolvedValue({});
  });

  it("rejects an invalid Twilio signature", async () => {
    mockValidate.mockReturnValue(false);
    const response = await POST(request("delivered", "bad"));
    expect(response.status).toBe(403);
    expect(mockPrisma.smsDraft.update).not.toHaveBeenCalled();
  });

  it("marks a delivered message DELIVERED and records one event", async () => {
    const response = await POST(request("delivered"));
    expect(response.status).toBe(200);
    expect(mockPrisma.smsDraft.update).toHaveBeenCalledWith({
      where: { id: "sms-1" },
      data: { status: "DELIVERED" },
    });
    expect(mockPrisma.smsEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dedupKey: "SM123:delivered", event: "delivered" }),
      }),
    );
  });

  it.each(["failed", "undelivered"])("marks %s messages FAILED", async (status) => {
    await POST(request(status));
    expect(mockPrisma.smsDraft.update).toHaveBeenCalledWith({
      where: { id: "sms-1" },
      data: { status: "FAILED" },
    });
  });

  it("accepts a callback for an unknown message id without error or side effects", async () => {
    mockPrisma.smsDraft.findFirst.mockResolvedValue(null);
    const response = await POST(request("delivered"));
    expect(response.status).toBe(200);
    expect(mockPrisma.smsDraft.update).not.toHaveBeenCalled();
    expect(mockPrisma.smsEvent.create).not.toHaveBeenCalled();
  });

  it("correlates an early callback by signed draft id and persists the Twilio SID", async () => {
    mockPrisma.smsDraft.findFirst.mockResolvedValue({
      id: "sms-1",
      status: "SENT",
      twilioMessageSid: null,
    });

    await POST(request("delivered", "valid-signature", "sms-1"));

    expect(mockPrisma.smsDraft.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ twilioMessageSid: "SM123" }, { id: "sms-1" }] },
      select: { id: true, status: true, twilioMessageSid: true },
    });
    expect(mockPrisma.smsDraft.update).toHaveBeenCalledWith({
      where: { id: "sms-1" },
      data: { status: "DELIVERED", twilioMessageSid: "SM123" },
    });
  });

  it("deduplicates a redelivered status callback", async () => {
    mockPrisma.smsEvent.findFirst.mockResolvedValue({ id: "event-1" });
    await POST(request("delivered"));
    expect(mockPrisma.smsDraft.update).not.toHaveBeenCalled();
    expect(mockPrisma.smsEvent.create).not.toHaveBeenCalled();
  });
});
