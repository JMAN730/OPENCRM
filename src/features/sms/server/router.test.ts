import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockIsConfigured, mockSendSmsMessage } = vi.hoisted(() => ({
  mockIsConfigured: vi.fn(),
  mockSendSmsMessage: vi.fn(),
}));

vi.mock("./twilio", () => ({
  isSmsConfigured: mockIsConfigured,
  sendSmsMessage: mockSendSmsMessage,
  validateTwilioWebhook: vi.fn(),
  smsStatusCallbackUrl: vi.fn(),
}));

import { createTestCaller } from "@/test/trpc";

describe("smsRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConfigured.mockReturnValue(true);
    mockSendSmsMessage.mockResolvedValue({ messageSid: "SM123" });
    process.env.NEXTAUTH_URL = "https://crm.example.com";
    process.env.SENDER_NAME = "Opulence";
    ({ caller, prisma } = createTestCaller({ sessionOverrides: { role: "USER" } }));
  });

  it("requires lead visibility and returns the latest org-scoped draft", async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
    prisma.smsDraft.findFirst.mockResolvedValue({ id: "sms-1", status: "DRAFT" });

    await expect(caller.sms.getForLead({ leadId: "lead-1" })).resolves.toMatchObject({
      id: "sms-1",
    });
    expect(prisma.smsDraft.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leadId: "lead-1", organizationId: "org-1" },
      }),
    );
  });

  it("generates a draft for a visible lead", async () => {
    const lead = { id: "lead-1", organizationId: "org-1", phone: "+15552345678" };
    prisma.lead.findFirst.mockResolvedValue(lead);
    prisma.generatedWebsite.findFirst.mockResolvedValue({ id: "web-1", slug: "acme-demo" });
    prisma.smsDraft.findFirst.mockResolvedValue(null);
    prisma.smsDraft.create.mockResolvedValue({ id: "sms-1" });

    await expect(caller.sms.generate({ leadId: "lead-1" })).resolves.toEqual({
      draftId: "sms-1",
    });
    expect(prisma.smsDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: "lead-1",
        organizationId: "org-1",
        toPhone: "+15552345678",
        body: expect.stringContaining("https://crm.example.com/demo/acme-demo"),
      }),
    });
  });

  it("edits only a visible draft that is still DRAFT", async () => {
    prisma.smsDraft.findFirst.mockResolvedValue({ id: "sms-1", status: "DRAFT" });
    prisma.smsDraft.update.mockResolvedValue({ id: "sms-1", body: "Personalized" });

    await caller.sms.updateBody({ id: "sms-1", body: "  Personalized  " });

    expect(prisma.smsDraft.findFirst).toHaveBeenCalledWith({
      where: {
        id: "sms-1",
        organizationId: "org-1",
        lead: { organizationId: "org-1", assignedToId: { in: ["user-1"] } },
      },
      select: { id: true, status: true },
    });
    expect(prisma.smsDraft.update).toHaveBeenCalledWith({
      where: { id: "sms-1" },
      data: { body: "Personalized" },
    });
  });

  it("prevents editing after send", async () => {
    prisma.smsDraft.findFirst.mockResolvedValue({ id: "sms-1", status: "SENT" });
    await expect(caller.sms.updateBody({ id: "sms-1", body: "Changed" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(prisma.smsDraft.update).not.toHaveBeenCalled();
  });

  it("uses the SMS org bucket and sends through the service", async () => {
    const { assertWithinRateLimit } = await import("@/lib/rateLimit");
    prisma.smsDraft.findFirst
      .mockResolvedValueOnce({ id: "sms-1" })
      .mockResolvedValueOnce({
        id: "sms-1",
        leadId: "lead-1",
        organizationId: "org-1",
        toPhone: "+15552345678",
        body: "Hi — demo link. Reply STOP to opt out.",
        status: "DRAFT",
        lead: { id: "lead-1", company: "Acme", phone: "(555) 234-5678" },
      });
    prisma.smsDraft.update.mockResolvedValue({});
    prisma.smsDraft.updateMany.mockResolvedValue({ count: 1 });

    await caller.sms.send({ id: "sms-1" });

    expect(assertWithinRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "sms-send:org-1", limit: 20 }),
    );
    expect(mockSendSmsMessage).toHaveBeenCalledWith({
      to: "+15552345678",
      body: "Hi — demo link. Reply STOP to opt out.",
      draftId: "sms-1",
    });
  });

  it("prevents a second request from sending a claimed draft", async () => {
    prisma.smsDraft.findFirst
      .mockResolvedValueOnce({ id: "sms-1" })
      .mockResolvedValueOnce({
        id: "sms-1",
        leadId: "lead-1",
        organizationId: "org-1",
        toPhone: "+15552345678",
        body: "Hi - demo link. Reply STOP to opt out.",
        status: "DRAFT",
        lead: { id: "lead-1", company: "Acme", phone: "(555) 234-5678" },
      });
    prisma.smsDraft.updateMany.mockResolvedValue({ count: 0 });

    await expect(caller.sms.send({ id: "sms-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "SMS draft has already been sent.",
    });
    expect(mockSendSmsMessage).not.toHaveBeenCalled();
  });

  it("refuses to send to an opted-out phone number", async () => {
    prisma.smsDraft.findFirst
      .mockResolvedValueOnce({ id: "sms-1" })
      .mockResolvedValueOnce({
        id: "sms-1",
        leadId: "lead-1",
        organizationId: "org-1",
        toPhone: "+15552345678",
        body: "Hi - demo link. Reply STOP to opt out.",
        status: "DRAFT",
        lead: { id: "lead-1", company: "Acme", phone: "(555) 234-5678" },
      });
    prisma.phoneOptOut.findUnique.mockResolvedValue({ id: "opt-out-1" });

    await expect(caller.sms.send({ id: "sms-1" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(prisma.smsDraft.updateMany).not.toHaveBeenCalled();
    expect(mockSendSmsMessage).not.toHaveBeenCalled();
  });

  it("stops before sending when the organization rate limit is exhausted", async () => {
    const { assertWithinRateLimit } = await import("@/lib/rateLimit");
    vi.mocked(assertWithinRateLimit).mockRejectedValueOnce(new Error("Rate limit exceeded"));

    await expect(caller.sms.send({ id: "sms-1" })).rejects.toThrow("Rate limit exceeded");
    expect(mockSendSmsMessage).not.toHaveBeenCalled();
  });

  it("surfaces missing Twilio configuration without breaking other features", async () => {
    prisma.smsDraft.findFirst.mockResolvedValue({ id: "sms-1" });
    mockIsConfigured.mockReturnValue(false);

    await expect(caller.sms.send({ id: "sms-1" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Twilio SMS is not configured.",
    });
  });
});
