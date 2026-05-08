import { describe, it, expect, beforeEach } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("callsRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  describe("logCall", () => {
    it("creates a call log when the lead belongs to the caller's org", async () => {
      prisma.lead.findUnique.mockResolvedValue({ organizationId: "org-1" });
      prisma.callLog.create.mockResolvedValue({ id: "call-1" });

      await caller.calls.logCall({
        leadId: "lead-1",
        status: "CONNECTED",
        duration: 30,
      });

      expect(prisma.callLog.create).toHaveBeenCalledWith({
        data: {
          leadId: "lead-1",
          userId: "user-1",
          status: "CONNECTED",
          duration: 30,
          disposition: undefined,
        },
      });
    });

    it("refuses when the lead is in a different org", async () => {
      prisma.lead.findUnique.mockResolvedValue({ organizationId: "other-org" });

      await expect(
        caller.calls.logCall({ leadId: "lead-1", status: "CONNECTED" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(prisma.callLog.create).not.toHaveBeenCalled();
    });

    it("refuses when the lead does not exist", async () => {
      prisma.lead.findUnique.mockResolvedValue(null);

      await expect(
        caller.calls.logCall({ leadId: "missing", status: "CONNECTED" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("requires the user to have an organizationId", async () => {
      const { caller: orphan } = createTestCaller({
        sessionOverrides: { organizationId: null },
      });

      await expect(
        orphan.calls.logCall({ leadId: "lead-1", status: "CONNECTED" })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });

    it("rejects invalid status enum values", async () => {
      await expect(
        // @ts-expect-error — testing zod runtime validation
        caller.calls.logCall({ leadId: "lead-1", status: "INVALID" })
      ).rejects.toThrow();
    });

    it("rejects non-positive duration", async () => {
      await expect(
        caller.calls.logCall({ leadId: "lead-1", status: "CONNECTED", duration: -1 })
      ).rejects.toThrow();
    });
  });

  describe("getForLead", () => {
    it("returns calls when the lead belongs to the caller's org", async () => {
      prisma.lead.findUnique.mockResolvedValue({ organizationId: "org-1" });
      const calls = [{ id: "c1" }];
      prisma.callLog.findMany.mockResolvedValue(calls);

      const result = await caller.calls.getForLead({ leadId: "lead-1" });

      expect(result).toEqual(calls);
      expect(prisma.callLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { leadId: "lead-1" } })
      );
    });

    it("refuses cross-tenant access", async () => {
      prisma.lead.findUnique.mockResolvedValue({ organizationId: "other-org" });
      await expect(
        caller.calls.getForLead({ leadId: "lead-1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("getRecent", () => {
    it("filters by org and limits to 10", async () => {
      prisma.callLog.findMany.mockResolvedValue([]);

      await caller.calls.getRecent();

      const args = prisma.callLog.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ lead: { organizationId: "org-1" } });
      expect(args.take).toBe(10);
      expect(args.orderBy).toEqual({ createdAt: "desc" });
    });
  });
});
