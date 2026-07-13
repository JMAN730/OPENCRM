import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestCaller } from "@/test/trpc";
import { assertWithinRateLimit } from "@/lib/rateLimit";
import { TRPCError } from "@trpc/server";

const { mockIsSmsConfigured, mockSendSms } = vi.hoisted(() => ({
  mockIsSmsConfigured: vi.fn(),
  mockSendSms: vi.fn(),
}));

vi.mock("@/features/sms/server/twilio", () => ({
  isSmsConfigured: mockIsSmsConfigured,
  sendSms: mockSendSms,
}));

describe("smsRouter", () => {
  beforeEach(() => {
    mockIsSmsConfigured.mockReturnValue(true);
    mockSendSms.mockReset();
    vi.mocked(assertWithinRateLimit).mockResolvedValue(undefined);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://crm.test");
    vi.stubEnv("SENDER_NAME", "Maya's Web Studio");
  });

  describe("getDraftForLead", () => {
    it("returns the latest org-scoped draft for a visible lead", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
      prisma.smsDraft.findFirst.mockResolvedValue({ id: "sms-1", body: "Hello" });

      await expect(caller.sms.getDraftForLead({ leadId: "lead-1" })).resolves.toEqual({
        configured: true,
        draft: { id: "sms-1", body: "Hello" },
      });

      expect(prisma.smsDraft.findFirst).toHaveBeenCalledWith({
        where: { leadId: "lead-1", organizationId: "org-1" },
        orderBy: { createdAt: "desc" },
        include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
      });
    });
  });

  describe("generate", () => {
    it("creates a static SMS draft with a demo link and normalized opt-out lookup", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      prisma.lead.findFirst.mockResolvedValue({
        id: "lead-1",
        organizationId: "org-1",
        assignedToId: "user-1",
        firstName: "Ava",
        company: "Acme",
        phone: "(813) 555-0199",
      });
      prisma.generatedWebsite.findFirst.mockResolvedValue({
        id: "site-1",
        slug: "acme-tampa",
      });
      prisma.smsDraft.findFirst.mockResolvedValue(null);
      prisma.smsDraft.create.mockResolvedValue({ id: "sms-1" });

      await expect(caller.sms.generate({ leadId: "lead-1" })).resolves.toEqual({
        draftId: "sms-1",
      });

      expect(prisma.phoneOptOut.findUnique).toHaveBeenCalledWith({
        where: {
          phone_organizationId: {
            phone: "+18135550199",
            organizationId: "org-1",
          },
        },
        select: { id: true },
      });
      expect(prisma.smsDraft.create).toHaveBeenCalledWith({
        data: {
          body:
            "Hi Ava, this is Maya's Web Studio. I put together a quick website demo for Acme: https://crm.test/demo/acme-tampa\n\nReply STOP to opt out",
          leadId: "lead-1",
          organizationId: "org-1",
          toPhone: "+18135550199",
          websiteId: "site-1",
        },
      });
      expect(prisma.activity.create).toHaveBeenCalledWith({
        data: {
          description: "SMS draft generated",
          leadId: "lead-1",
          organizationId: "org-1",
          type: "SMS_DRAFT_CREATED",
          userId: "user-1",
        },
      });
    });

    it("rejects a phone extension instead of folding it into the E.164 destination", async () => {
      const { caller, prisma } = createTestCaller();
      prisma.lead.findFirst.mockResolvedValue({
        id: "lead-1",
        organizationId: "org-1",
        phone: "+1 813 555 0199 ext 2",
      });

      await expect(caller.sms.generate({ leadId: "lead-1" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Phone number contains unsupported characters or an extension.",
      });
      expect(prisma.smsDraft.create).not.toHaveBeenCalled();
    });
  });

  describe("updateDraft", () => {
    it("updates the body of an org-scoped draft that is still editable", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      prisma.smsDraft.findFirst.mockResolvedValue({ id: "sms-1", status: "DRAFT" });
      prisma.smsDraft.update.mockResolvedValue({ id: "sms-1", body: "Personalized body" });

      await expect(
        caller.sms.updateDraft({ id: "sms-1", body: "  Personalized body  " }),
      ).resolves.toEqual({ id: "sms-1", body: "Personalized body" });

      expect(prisma.smsDraft.findFirst).toHaveBeenCalledWith({
        where: {
          id: "sms-1",
          organizationId: "org-1",
          lead: {
            organizationId: "org-1",
            assignedToId: { in: ["user-1"] },
          },
        },
        select: { id: true, status: true },
      });
      expect(prisma.smsDraft.update).toHaveBeenCalledWith({
        where: { id: "sms-1", organizationId: "org-1" },
        data: { body: "Personalized body" },
      });
    });
  });

  describe("send", () => {
    it("sends an editable draft and records the Twilio message and activity", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      prisma.smsDraft.findFirst
        .mockResolvedValueOnce({ id: "sms-1" })
        .mockResolvedValueOnce({
          id: "sms-1",
          leadId: "lead-1",
          organizationId: "org-1",
          body:
            "Hi Ava, this is Maya's Web Studio. Edited outreach body\n\nReply STOP to opt out",
          status: "DRAFT",
          toPhone: "+18135550199",
          lead: { id: "lead-1" },
        });
      prisma.smsDraft.update.mockResolvedValue({ id: "sms-1", status: "SENT" });
      mockSendSms.mockResolvedValue({ messageSid: "SM123" });

      await expect(caller.sms.send({ id: "sms-1" })).resolves.toEqual({
        messageId: "SM123",
      });

      expect(mockSendSms).toHaveBeenCalledWith({
        body:
          "Hi Ava, this is Maya's Web Studio. Edited outreach body\n\nReply STOP to opt out",
        to: "+18135550199",
      });
      expect(prisma.smsDraft.update).toHaveBeenCalledWith({
        where: { id: "sms-1", organizationId: "org-1", status: "SENDING" },
        data: {
          sentAt: expect.any(Date),
          status: "SENT",
          twilioMessageSid: "SM123",
        },
      });
      expect(prisma.smsEvent.create).toHaveBeenCalledWith({
        data: {
          data: { twilio_message_sid: "SM123" },
          draftId: "sms-1",
          event: "sent",
          organizationId: "org-1",
        },
      });
      expect(prisma.activity.create).toHaveBeenCalledWith({
        data: {
          description: "Outreach SMS sent to +18135550199",
          leadId: "lead-1",
          organizationId: "org-1",
          type: "SMS_SENT",
          userId: "user-1",
        },
      });
    });

    it("reports Twilio as not configured without attempting delivery", async () => {
      const { caller, prisma } = createTestCaller();
      mockIsSmsConfigured.mockReturnValue(false);
      prisma.smsDraft.findFirst.mockResolvedValue({ id: "sms-1" });

      await expect(caller.sms.send({ id: "sms-1" })).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: "Twilio SMS is not configured for this workspace.",
      });
      expect(mockSendSms).not.toHaveBeenCalled();
    });

    it("refuses to send to an org phone opt-out", async () => {
      const { caller, prisma } = createTestCaller();
      prisma.smsDraft.findFirst
        .mockResolvedValueOnce({ id: "sms-1" })
        .mockResolvedValueOnce({
          id: "sms-1",
          leadId: "lead-1",
          body: "Hello",
          status: "DRAFT",
          toPhone: "+18135550199",
          lead: { id: "lead-1" },
        });
      prisma.phoneOptOut.findUnique.mockResolvedValue({ id: "opt-1" });

      await expect(caller.sms.send({ id: "sms-1" })).rejects.toMatchObject({
        code: "CONFLICT",
        message: "This phone number has opted out.",
      });
      expect(mockSendSms).not.toHaveBeenCalled();
    });

    it("refuses to send a draft twice", async () => {
      const { caller, prisma } = createTestCaller();
      prisma.smsDraft.findFirst
        .mockResolvedValueOnce({ id: "sms-1" })
        .mockResolvedValueOnce({
          id: "sms-1",
          leadId: "lead-1",
          body: "Hello",
          status: "SENT",
          toPhone: "+18135550199",
          lead: { id: "lead-1" },
        });

      await expect(caller.sms.send({ id: "sms-1" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "SMS draft was already sent.",
      });
      expect(mockSendSms).not.toHaveBeenCalled();
    });

    it("refuses delivery when another request already claimed the draft", async () => {
      const { caller, prisma } = createTestCaller();
      prisma.smsDraft.findFirst
        .mockResolvedValueOnce({ id: "sms-1" })
        .mockResolvedValueOnce({
          id: "sms-1",
          leadId: "lead-1",
          body:
            "Hi Ava, this is Maya's Web Studio. Hello\n\nReply STOP to opt out",
          status: "DRAFT",
          toPhone: "+18135550199",
          lead: { id: "lead-1" },
        });
      prisma.smsDraft.updateMany.mockResolvedValue({ count: 0 });

      await expect(caller.sms.send({ id: "sms-1" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "SMS draft was already sent.",
      });
      expect(mockSendSms).not.toHaveBeenCalled();
    });

    it("refuses an edited draft that removed the fixed opt-out line", async () => {
      const { caller, prisma } = createTestCaller();
      prisma.smsDraft.findFirst
        .mockResolvedValueOnce({ id: "sms-1" })
        .mockResolvedValueOnce({
          id: "sms-1",
          leadId: "lead-1",
          body: "Hi Ava, this is Maya's Web Studio. Hello",
          status: "DRAFT",
          toPhone: "+18135550199",
          lead: { id: "lead-1" },
        });

      await expect(caller.sms.send({ id: "sms-1" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: 'SMS body must end with "Reply STOP to opt out".',
      });
      expect(mockSendSms).not.toHaveBeenCalled();
    });

    it("draws from the per-org SMS budget before sending", async () => {
      const { caller, prisma } = createTestCaller();
      vi.mocked(assertWithinRateLimit).mockRejectedValue(
        new TRPCError({ code: "TOO_MANY_REQUESTS", message: "SMS budget exhausted." }),
      );

      await expect(caller.sms.send({ id: "sms-1" })).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
      expect(assertWithinRateLimit).toHaveBeenCalledWith({
        key: "sms-send:org-1",
        limit: 20,
        windowSeconds: 60,
      });
      expect(prisma.smsDraft.findFirst).not.toHaveBeenCalled();
      expect(mockSendSms).not.toHaveBeenCalled();
    });
  });
});
