import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("callsRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  describe("generateToken", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("returns a token when Twilio env vars are set", async () => {
      vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest");
      vi.stubEnv("TWILIO_API_KEY", "SKtest");
      vi.stubEnv("TWILIO_API_SECRET", "secret");
      vi.stubEnv("TWILIO_TWIML_APP_SID", "APtest");

      const result = await caller.calls.generateToken();
      expect(result.token).toBeTruthy();
      expect(typeof result.token).toBe("string");
    });

    it("throws PRECONDITION_FAILED when Twilio is not configured", async () => {
      vi.stubEnv("TWILIO_ACCOUNT_SID", "");
      vi.stubEnv("TWILIO_API_KEY", "");
      vi.stubEnv("TWILIO_API_SECRET", "");
      vi.stubEnv("TWILIO_TWIML_APP_SID", "");

      await expect(caller.calls.generateToken()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
    });
  });

  describe("logCall", () => {
    it("creates a call log when the lead belongs to the caller's org", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
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
          twilioCallSid: undefined,
        },
      });
    });

    it("creates a call log without a leadId", async () => {
      prisma.callLog.create.mockResolvedValue({ id: "call-2" });

      await caller.calls.logCall({ status: "NO_ANSWER" });

      expect(prisma.lead.findUnique).not.toHaveBeenCalled();
      expect(prisma.callLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ leadId: undefined, status: "NO_ANSWER" }),
      });
    });

    it("persists twilioCallSid when provided", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
      prisma.callLog.create.mockResolvedValue({ id: "call-3" });

      await caller.calls.logCall({
        leadId: "lead-1",
        status: "CONNECTED",
        twilioCallSid: "CA123",
      });

      expect(prisma.callLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ twilioCallSid: "CA123" }),
      });
    });

    it("refuses when the lead is outside lead visibility", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        caller.calls.logCall({ leadId: "lead-1", status: "CONNECTED" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(prisma.callLog.create).not.toHaveBeenCalled();
    });

    it("refuses when the lead does not exist", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

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

    it("checks assigned-lead visibility for non-admin callers", async () => {
      const { caller: userCaller, prisma: userPrisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      userPrisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
      userPrisma.callLog.create.mockResolvedValue({ id: "call-1" });

      await userCaller.calls.logCall({ leadId: "lead-1", status: "CONNECTED" });

      expect(userPrisma.lead.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          id: "lead-1",
          organizationId: "org-1",
          assignedToId: { in: ["user-1"] },
        },
      });
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

    it("rejects duration of zero (must be positive)", async () => {
      await expect(
        caller.calls.logCall({ leadId: "lead-1", status: "CONNECTED", duration: 0 })
      ).rejects.toThrow();
    });
  });

  describe("getForLead", () => {
    it("returns calls when the lead belongs to the caller's org", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
      const calls = [{ id: "c1" }];
      prisma.callLog.findMany.mockResolvedValue(calls);

      const result = await caller.calls.getForLead({ leadId: "lead-1" });

      expect(result).toEqual(calls);
      expect(prisma.callLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { leadId: "lead-1" } })
      );
    });

    it("refuses access outside lead visibility", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        caller.calls.getForLead({ leadId: "lead-1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("getRecent", () => {
    it("scopes to the caller's own calls, keeps lead-less calls, and limits to 10", async () => {
      prisma.callLog.findMany.mockResolvedValue([]);

      await caller.calls.getRecent();

      const args = prisma.callLog.findMany.mock.calls[0][0];
      // Personal list: scoped by the caller's userId, not org-wide. The OR
      // keeps lead-less (raw-number) calls that an inner join would drop.
      expect(args.where).toEqual({
        userId: "user-1",
        OR: [{ leadId: null }, { lead: { organizationId: "org-1" } }],
      });
      expect(args.take).toBe(10);
      expect(args.orderBy).toEqual({ createdAt: "desc" });
    });
  });
});
