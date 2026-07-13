import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/features/emails/server/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./../../emails/server/service")>()),
  sendDraft: vi.fn(),
}));
vi.mock("@/features/sms/server/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./../../sms/server/service")>()),
  sendSmsDraft: vi.fn(),
}));

import { createTestCaller } from "@/test/trpc";
import { sendDraft, OutreachEmailError } from "@/features/emails/server/service";
import { sendSmsDraft } from "@/features/sms/server/service";

describe("outreachRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    vi.clearAllMocks();
    ({ caller, prisma } = createTestCaller());
  });

  describe("stats", () => {
    it("returns zeroed counts for every status, org-scoped", async () => {
      prisma.outreachJob.groupBy.mockResolvedValue([
        { status: "DONE", _count: { _all: 4 } },
        { status: "SKIPPED", _count: { _all: 2 } },
      ]);

      const stats = await caller.outreach.stats();

      expect(prisma.outreachJob.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1" }) }),
      );
      expect(stats).toEqual({ PENDING: 0, PROCESSING: 0, DONE: 4, FAILED: 0, SKIPPED: 2 });
    });
  });

  describe("list", () => {
    it("filters queue rows through lead visibility", async () => {
      const scoped = createTestCaller({ sessionOverrides: { role: "USER" } });
      scoped.prisma.outreachJob.findMany.mockResolvedValue([]);

      await scoped.caller.outreach.list({});

      expect(scoped.prisma.outreachJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: "org-1",
            lead: { organizationId: "org-1", assignedToId: { in: ["user-1"] } },
          },
        }),
      );
    });

    it("scopes to the caller's org and resolves drafts/websites org-scoped", async () => {
      prisma.outreachJob.findMany.mockResolvedValue([
        {
          id: "oj-1",
          status: "DONE",
          attempts: 1,
          error: null,
          skipReason: null,
          processedAt: new Date(),
          createdAt: new Date(),
          draftId: "draft-1",
          smsDraftId: null,
          websiteId: "web-1",
          lead: { id: "lead-1", company: "Acme", email: "a@acme.com", phone: null, city: null, state: null },
        },
      ]);
      prisma.emailDraft.findMany.mockResolvedValue([
        { id: "draft-1", subject: "Hi", body: "Email body", status: "DRAFT", sentAt: null },
      ]);
      prisma.generatedWebsite.findMany.mockResolvedValue([{ id: "web-1", slug: "acme-demo" }]);

      const page = await caller.outreach.list({});

      expect(prisma.outreachJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1" }) }),
      );
      expect(prisma.emailDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["draft-1"] }, organizationId: "org-1" },
        }),
      );
      expect(page.items[0].draft?.channel).toBe("EMAIL");
      if (page.items[0].draft?.channel !== "EMAIL") throw new Error("Expected email draft");
      expect(page.items[0].draft.subject).toBe("Hi");
      expect(page.items[0].website?.slug).toBe("acme-demo");
      expect(page.nextCursor).toBeUndefined();
    });

    it("returns SMS drafts with their channel and preview body", async () => {
      prisma.outreachJob.findMany.mockResolvedValue([{
        id: "oj-sms",
        status: "DONE",
        attempts: 1,
        error: null,
        skipReason: null,
        processedAt: new Date(),
        createdAt: new Date(),
        draftId: null,
        smsDraftId: "sms-1",
        websiteId: "web-1",
        lead: {
          id: "lead-1",
          company: "Acme",
          email: null,
          phone: "+15552345678",
          city: null,
          state: null,
        },
      }]);
      prisma.smsDraft.findMany.mockResolvedValue([{
        id: "sms-1",
        body: "Hi — demo link",
        status: "DRAFT",
        sentAt: null,
      }]);

      const page = await caller.outreach.list({});

      expect(prisma.smsDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["sms-1"] }, organizationId: "org-1" },
        }),
      );
      expect(page.items[0].draft).toMatchObject({
        id: "sms-1",
        channel: "SMS",
        body: "Hi — demo link",
      });
    });

    it("passes the status filter and returns a cursor when there are more rows", async () => {
      const rows = Array.from({ length: 3 }, (_, i) => ({
        id: `oj-${i}`,
        status: "SKIPPED",
        attempts: 1,
        error: null,
        skipReason: "no_email",
        processedAt: null,
        createdAt: new Date(),
        draftId: null,
        smsDraftId: null,
        websiteId: null,
        lead: { id: `lead-${i}`, company: null, email: null, phone: null, city: null, state: null },
      }));
      prisma.outreachJob.findMany.mockResolvedValue(rows);

      const page = await caller.outreach.list({ status: "SKIPPED", limit: 2 });

      expect(prisma.outreachJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: "org-1", status: "SKIPPED" }),
          take: 3,
        }),
      );
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBe("oj-1");
    });
  });

  describe("retry", () => {
    it("resets a FAILED job to PENDING", async () => {
      prisma.outreachJob.findFirst.mockResolvedValue({ id: "oj-1", status: "FAILED" });

      await caller.outreach.retry({ id: "oj-1" });

      expect(prisma.outreachJob.update).toHaveBeenCalledWith({
        where: { id: "oj-1" },
        data: { status: "PENDING", attempts: 0, error: null, skipReason: null },
      });
    });

    it("rejects retrying a DONE job", async () => {
      prisma.outreachJob.findFirst.mockResolvedValue({ id: "oj-1", status: "DONE" });

      await expect(caller.outreach.retry({ id: "oj-1" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(prisma.outreachJob.update).not.toHaveBeenCalled();
    });

    it("rejects cross-tenant access", async () => {
      prisma.outreachJob.findFirst.mockResolvedValue(null);
      await expect(caller.outreach.retry({ id: "oj-x" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("bulkSend", () => {
    it("sends each draft and reports partial failures", async () => {
      prisma.emailDraft.findFirst.mockResolvedValue({ id: "d1" });
      prisma.smsDraft.findFirst.mockResolvedValue({ id: "s1" });
      vi.mocked(sendDraft)
        .mockResolvedValueOnce({ messageId: "m1" });
      vi.mocked(sendSmsDraft).mockRejectedValueOnce(
        new OutreachEmailError("OPTED_OUT", "This phone number has opted out."),
      );

      const result = await caller.outreach.bulkSend({
        drafts: [
          { id: "d1", channel: "EMAIL" },
          { id: "s1", channel: "SMS" },
        ],
      });

      expect(sendDraft).toHaveBeenCalledTimes(1);
      expect(sendSmsDraft).toHaveBeenCalledTimes(1);
      expect(sendDraft).toHaveBeenCalledWith(prisma, {
        draftId: "d1",
        organizationId: "org-1",
        userId: "user-1",
      });
      expect(result.sent).toEqual([{ id: "d1", channel: "EMAIL" }]);
      expect(result.failed).toEqual([
        { id: "s1", channel: "SMS", error: "This phone number has opted out." },
      ]);
    });

    it("rejects more than 20 drafts per call", async () => {
      const drafts = Array.from({ length: 21 }, (_, i) => ({ id: `d${i}`, channel: "EMAIL" as const }));
      await expect(caller.outreach.bulkSend({ drafts })).rejects.toThrow();
      expect(sendDraft).not.toHaveBeenCalled();
    });

    it("consumes each channel's own rate-limit budget", async () => {
      const { assertWithinRateLimit } = await import("@/lib/rateLimit");
      prisma.emailDraft.findFirst.mockResolvedValue({ id: "d1" });
      prisma.smsDraft.findFirst.mockResolvedValue({ id: "s1" });
      vi.mocked(sendDraft).mockResolvedValue({ messageId: "m1" });
      vi.mocked(sendSmsDraft).mockResolvedValue({ messageId: "SM1" });

      await caller.outreach.bulkSend({
        drafts: [
          { id: "d1", channel: "EMAIL" },
          { id: "s1", channel: "SMS" },
          { id: "s2", channel: "SMS" },
        ],
      });

      expect(assertWithinRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({ key: "email-send:org-1", limit: 20, cost: 1 }),
      );
      expect(assertWithinRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({ key: "sms-send:org-1", limit: 20, cost: 2 }),
      );
    });
  });
});
