import { describe, it, expect, beforeEach } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("customOutcomesRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  describe("list", () => {
    it("returns custom outcomes for the caller's organization", async () => {
      const outcomes = [
        { id: "o1", label: "Booked demo", hint: "Calendar invite sent" },
        { id: "o2", label: "Call back later", hint: null },
      ];
      prisma.customOutcome.findMany.mockResolvedValue(outcomes);

      const result = await caller.leads.customOutcomes.list();

      expect(result).toEqual(outcomes);
      expect(prisma.customOutcome.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: "org-1" } }),
      );
    });

    it("orders outcomes by createdAt ascending", async () => {
      prisma.customOutcome.findMany.mockResolvedValue([]);

      await caller.leads.customOutcomes.list();

      expect(prisma.customOutcome.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "asc" } }),
      );
    });

    it("requires an authenticated session", async () => {
      const { caller: unauthed } = createTestCaller({ session: null });

      await expect(unauthed.leads.customOutcomes.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("throws when organizationId is missing from the session", async () => {
      const { caller: noOrg } = createTestCaller({
        sessionOverrides: { organizationId: null },
      });

      await expect(noOrg.leads.customOutcomes.list()).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "User has no organization.",
      });
    });
  });

  describe("create", () => {
    beforeEach(() => {
      prisma.customOutcome.findFirst.mockResolvedValue(null);
      prisma.customOutcome.create.mockResolvedValue({
        id: "o-new",
        label: "Booked demo",
        hint: null,
        organizationId: "org-1",
        createdAt: new Date(),
      });
    });

    it("creates a new custom outcome scoped to the organization", async () => {
      const result = await caller.leads.customOutcomes.create({ label: "Booked demo" });

      expect(prisma.customOutcome.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            label: "Booked demo",
            organizationId: "org-1",
          }),
        }),
      );
      expect(result).toMatchObject({ label: "Booked demo" });
    });

    it("stores an optional hint", async () => {
      await caller.leads.customOutcomes.create({ label: "Booked demo", hint: "Send calendar link" });

      expect(prisma.customOutcome.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hint: "Send calendar link" }),
        }),
      );
    });

    it("throws BAD_REQUEST when a duplicate label exists in the organization", async () => {
      prisma.customOutcome.findFirst.mockResolvedValue({ id: "existing" });

      await expect(
        caller.leads.customOutcomes.create({ label: "Booked demo" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(prisma.customOutcome.create).not.toHaveBeenCalled();
    });

    it("rejects an empty label", async () => {
      await expect(
        caller.leads.customOutcomes.create({ label: "" }),
      ).rejects.toThrow();
    });

    it("rejects a label longer than 80 characters", async () => {
      await expect(
        caller.leads.customOutcomes.create({ label: "a".repeat(81) }),
      ).rejects.toThrow();
    });

    it("rejects a hint longer than 200 characters", async () => {
      await expect(
        caller.leads.customOutcomes.create({ label: "Valid label", hint: "x".repeat(201) }),
      ).rejects.toThrow();
    });
  });

  describe("delete", () => {
    beforeEach(() => {
      prisma.customOutcome.findFirst.mockResolvedValue({ id: "o1" });
      prisma.lead.updateMany.mockResolvedValue({ count: 0 });
      prisma.customOutcome.delete.mockResolvedValue({ id: "o1" });
    });

    it("deletes the outcome after resetting affected leads", async () => {
      await caller.leads.customOutcomes.delete({ id: "o1" });

      expect(prisma.lead.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customOutcomeId: "o1" },
          data: expect.objectContaining({
            callOutcome: "NOT_CONTACTED",
            status: "NOT_CONTACTED",
            customOutcomeId: null,
          }),
        }),
      );
      expect(prisma.lead.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { secondaryOutcomeId: "o1" },
          data: { secondaryOutcomeId: null },
        }),
      );
      expect(prisma.customOutcome.delete).toHaveBeenCalledWith({ where: { id: "o1" } });
    });

    it("throws NOT_FOUND when the outcome does not belong to the organization", async () => {
      prisma.customOutcome.findFirst.mockResolvedValue(null);

      await expect(
        caller.leads.customOutcomes.delete({ id: "o-other-org" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(prisma.customOutcome.delete).not.toHaveBeenCalled();
    });

    it("scopes the ownership check to the caller's organization", async () => {
      await caller.leads.customOutcomes.delete({ id: "o1" });

      expect(prisma.customOutcome.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: "org-1" }),
        }),
      );
    });

    it("requires an authenticated session", async () => {
      const { caller: unauthed } = createTestCaller({ session: null });

      await expect(unauthed.leads.customOutcomes.delete({ id: "o1" })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });
  });
});
