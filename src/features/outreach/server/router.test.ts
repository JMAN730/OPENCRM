import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/features/emails/server/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./../../emails/server/service")>()),
  sendDraft: vi.fn(),
}));

import { createTestCaller } from "@/test/trpc";
import { sendDraft, OutreachEmailError } from "@/features/emails/server/service";

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
        expect.objectContaining({ where: { organizationId: "org-1" } }),
      );
      expect(stats).toEqual({ PENDING: 0, PROCESSING: 0, DONE: 4, FAILED: 0, SKIPPED: 2 });
    });
  });

  describe("list", () => {
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
          websiteId: "web-1",
          lead: { id: "lead-1", company: "Acme", email: "a@acme.com", city: null, state: null },
        },
      ]);
      prisma.emailDraft.findMany.mockResolvedValue([
        { id: "draft-1", subject: "Hi", status: "DRAFT", sentAt: null },
      ]);
      prisma.generatedWebsite.findMany.mockResolvedValue([{ id: "web-1", slug: "acme-demo" }]);

      const page = await caller.outreach.list({});

      expect(prisma.outreachJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: "org-1" } }),
      );
      expect(prisma.emailDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["draft-1"] }, organizationId: "org-1" },
        }),
      );
      expect(page.items[0].draft?.subject).toBe("Hi");
      expect(page.items[0].website?.slug).toBe("acme-demo");
      expect(page.nextCursor).toBeUndefined();
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
        websiteId: null,
        lead: { id: `lead-${i}`, company: null, email: null, city: null, state: null },
      }));
      prisma.outreachJob.findMany.mockResolvedValue(rows);

      const page = await caller.outreach.list({ status: "SKIPPED", limit: 2 });

      expect(prisma.outreachJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: "org-1", status: "SKIPPED" },
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
      vi.mocked(sendDraft)
        .mockResolvedValueOnce({ messageId: "m1" })
        .mockRejectedValueOnce(new OutreachEmailError("OPTED_OUT", "This email address has opted out."));

      const result = await caller.outreach.bulkSend({ draftIds: ["d1", "d2"] });

      expect(sendDraft).toHaveBeenCalledTimes(2);
      expect(sendDraft).toHaveBeenCalledWith(prisma, {
        draftId: "d1",
        organizationId: "org-1",
        userId: "user-1",
      });
      expect(result.sent).toEqual(["d1"]);
      expect(result.failed).toEqual([
        { draftId: "d2", error: "This email address has opted out." },
      ]);
    });

    it("rejects more than 20 drafts per call", async () => {
      const draftIds = Array.from({ length: 21 }, (_, i) => `d${i}`);
      await expect(caller.outreach.bulkSend({ draftIds })).rejects.toThrow();
      expect(sendDraft).not.toHaveBeenCalled();
    });

    it("consumes one rate-limit unit per draft in the batch", async () => {
      const { assertWithinRateLimit } = await import("@/lib/rateLimit");
      vi.mocked(sendDraft).mockResolvedValue({ messageId: "m1" });

      await caller.outreach.bulkSend({ draftIds: ["d1", "d2", "d3"] });

      expect(assertWithinRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({ key: "email-send:org-1", limit: 20, cost: 3 }),
      );
    });
  });
});
