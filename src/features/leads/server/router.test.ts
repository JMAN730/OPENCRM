import { describe, it, expect, beforeEach } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("leadsRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  describe("getAll", () => {
    it("filters by the caller's organizationId", async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      const result = await caller.leads.getAll();

      expect(prisma.lead.findMany).toHaveBeenCalledTimes(1);
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.organizationId).toBe("org-1");
      expect(result).toEqual({ items: [], nextCursor: null });
    });

    it("applies general search across company, name, email, phone", async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      await caller.leads.getAll({ search: "acme" });

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { company: { contains: "acme", mode: "insensitive" } },
        { firstName: { contains: "acme", mode: "insensitive" } },
        { lastName: { contains: "acme", mode: "insensitive" } },
        { email: { contains: "acme", mode: "insensitive" } },
        { phone: { contains: "acme", mode: "insensitive" } },
      ]);
    });

    it("keeps general search active for state-only queries while matching normalized state", async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      await caller.leads.getAll({ search: "FL" });

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { company: { contains: "FL", mode: "insensitive" } },
        { firstName: { contains: "FL", mode: "insensitive" } },
        { lastName: { contains: "FL", mode: "insensitive" } },
        { email: { contains: "FL", mode: "insensitive" } },
        { phone: { contains: "FL", mode: "insensitive" } },
        { AND: [{ state: "FL" }] },
        { city: { contains: "FL", mode: "insensitive" } },
      ]);
    });

    it("uses normalized state and city matching when search includes city plus state", async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      await caller.leads.getAll({ search: "Tampa FL" });

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { company: { contains: "Tampa FL", mode: "insensitive" } },
        { firstName: { contains: "Tampa FL", mode: "insensitive" } },
        { lastName: { contains: "Tampa FL", mode: "insensitive" } },
        { email: { contains: "Tampa FL", mode: "insensitive" } },
        { phone: { contains: "Tampa FL", mode: "insensitive" } },
        {
          AND: [
            { state: "FL" },
            { city: { contains: "Tampa", mode: "insensitive" } },
          ],
        },
        { city: { contains: "Tampa FL", mode: "insensitive" } },
      ]);
    });

    it("normalizes full state names in location search", async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      await caller.leads.getAll({ search: "Tampa, Florida" });

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { company: { contains: "Tampa, Florida", mode: "insensitive" } },
        { firstName: { contains: "Tampa, Florida", mode: "insensitive" } },
        { lastName: { contains: "Tampa, Florida", mode: "insensitive" } },
        { email: { contains: "Tampa, Florida", mode: "insensitive" } },
        { phone: { contains: "Tampa, Florida", mode: "insensitive" } },
        {
          AND: [
            { state: "FL" },
            { city: { contains: "Tampa", mode: "insensitive" } },
          ],
        },
        { city: { contains: "Tampa, Florida", mode: "insensitive" } },
      ]);
    });

    it("includes a legacy city fallback when searching by city plus state", async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      await caller.leads.getAll({ search: "Tampa, Florida" });

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.OR).toContainEqual({
        city: { contains: "Tampa, Florida", mode: "insensitive" },
      });
    });

    it("orders results by (createdAt desc, id desc) for stable cursor pagination", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await caller.leads.getAll();
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    });

    it("takes (limit + 1) so it can detect another page without a count()", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await caller.leads.getAll({ limit: 25 });
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.take).toBe(26);
    });

    it("returns nextCursor when more rows exist than the requested limit", async () => {
      const rows = Array.from({ length: 51 }, (_, i) => ({
        id: `lead-${i}`,
        organizationId: "org-1",
        createdAt: new Date(),
      }));
      prisma.lead.findMany.mockResolvedValue(rows);

      const result = await caller.leads.getAll({ limit: 50 });

      expect(result.items).toHaveLength(50);
      // The 51st row is consumed for hasMore detection; its id is the cursor.
      expect(result.nextCursor).toBe("lead-50");
    });

    it("returns nextCursor=null when fewer rows than the limit are returned", async () => {
      prisma.lead.findMany.mockResolvedValue([{ id: "x", organizationId: "org-1" }]);
      const result = await caller.leads.getAll({ limit: 50 });
      expect(result.nextCursor).toBeNull();
    });

    it("forwards the cursor to Prisma as a skip-1 cursor on the next page", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await caller.leads.getAll({ cursor: "lead-50", limit: 25 });
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.cursor).toEqual({ id: "lead-50" });
      expect(args.skip).toBe(1);
    });

    it("treats whitespace-only search as no search (no OR clause)", async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      await caller.leads.getAll({ search: "   " });

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.OR).toBeUndefined();
    });

    it("filters by status when provided", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await caller.leads.getAll({ status: "CONNECTED" });
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.status).toBe("CONNECTED");
    });

    it("excludes custom outcomes from generic status filters", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await caller.leads.getAll({ status: "CONNECTED" });
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where).toEqual(
        expect.objectContaining({
          status: "CONNECTED",
          callOutcome: { not: "CUSTOM" },
        }),
      );
    });
  });

  describe("getById", () => {
    it("returns the lead when it belongs to the caller's org", async () => {
      const lead = { id: "lead-1", organizationId: "org-1", firstName: "A" };
      prisma.lead.findFirst.mockResolvedValue(lead);

      const result = await caller.leads.getById({ id: "lead-1" });

      expect(prisma.lead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "lead-1", organizationId: "org-1" },
        }),
      );
      expect(result).toEqual(lead);
    });

    it("throws NOT_FOUND when the lead is in a different org (multi-tenancy)", async () => {
      // Cross-tenant lookup: findFirst with our org will return null
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(caller.leads.getById({ id: "lead-1" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("delete", () => {
    it("checks org ownership before deleting", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
      prisma.lead.delete.mockResolvedValue({ id: "lead-1" });

      await caller.leads.delete({ id: "lead-1" });

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: { id: "lead-1", organizationId: "org-1" },
      });
      expect(prisma.lead.delete).toHaveBeenCalledWith({ where: { id: "lead-1" } });
    });

    it("refuses to delete a lead from another org", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(caller.leads.delete({ id: "lead-1" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(prisma.lead.delete).not.toHaveBeenCalled();
    });
  });

  describe("bulkDelete", () => {
    it("deletes multiple leads after scope check", async () => {
      prisma.team.findMany.mockResolvedValue([]);
      prisma.lead.findMany.mockResolvedValue([{ id: "lead-1" }, { id: "lead-2" }]);
      prisma.lead.deleteMany.mockResolvedValue({ count: 2 });

      const result = await caller.leads.bulkDelete({ leadIds: ["lead-1", "lead-2"] });

      expect(prisma.lead.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["lead-1", "lead-2"] }, organizationId: "org-1" },
        select: { id: true },
      });
      expect(prisma.lead.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["lead-1", "lead-2"] } },
      });
      expect(result).toEqual({ count: 2 });
    });

    it("refuses when any lead is outside scope", async () => {
      prisma.team.findMany.mockResolvedValue([]);
      prisma.lead.findMany.mockResolvedValue([{ id: "lead-1" }]); // missing lead-2

      await expect(
        caller.leads.bulkDelete({ leadIds: ["lead-1", "lead-2"] })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(prisma.lead.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("attaches organizationId and assignedToId from the session", async () => {
      prisma.lead.create.mockResolvedValue({ id: "lead-1" });

      await caller.leads.create({
        firstName: "John",
        lastName: "Doe",
        status: "NOT_CONTACTED",
      });

      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: {
          firstName: "John",
          lastName: "Doe",
          status: "NOT_CONTACTED",
          organizationId: "org-1",
          assignedToId: "user-1",
        },
      });
    });

    it("rejects callers without an organization", async () => {
      const { caller: orphanCaller } = createTestCaller({
        sessionOverrides: { organizationId: null },
      });

      await expect(orphanCaller.leads.create({ status: "NOT_CONTACTED" })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    });

    it("rejects invalid status enum values", async () => {
      await expect(
        // @ts-expect-error — testing zod runtime validation
        caller.leads.create({ status: "BOGUS" })
      ).rejects.toThrow();
    });
  });

  describe("bulkCreate", () => {
    it("attaches org/user to every row", async () => {
      prisma.lead.createMany.mockResolvedValue({ count: 2 });

      const result = await caller.leads.bulkCreate([
        { firstName: "A", status: "NOT_CONTACTED" },
        { firstName: "B", status: "NOT_CONTACTED" },
      ]);

      expect(prisma.lead.findMany).not.toHaveBeenCalled();
      expect(prisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          { firstName: "A", status: "NOT_CONTACTED", organizationId: "org-1", assignedToId: "user-1" },
          { firstName: "B", status: "NOT_CONTACTED", organizationId: "org-1", assignedToId: "user-1" },
        ],
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ count: 2 });
    });

    it("updates an existing lead (matched by email) instead of duplicating", async () => {
      prisma.lead.findMany.mockResolvedValue([
        { id: "lead-1", email: "a@example.com", phone: null, status: "CONNECTED" },
      ]);
      prisma.lead.update.mockResolvedValue({ id: "lead-1" });
      prisma.$transaction.mockResolvedValue([{ id: "lead-1" }]);

      const result = await caller.leads.bulkCreate([
        { email: "A@EXAMPLE.COM", phone: "", company: "Acme", status: "NOT_CONTACTED" },
      ]);

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "org-1",
            OR: [{ email: { in: ["a@example.com"] } }],
          }),
        }),
      );
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: expect.objectContaining({
          email: "a@example.com",
          company: "Acme",
        }),
      });
      // Status should not be downgraded back to NOT_CONTACTED
      expect(prisma.lead.update.mock.calls[0]?.[0]?.data?.status).toBeUndefined();
      expect(result).toEqual({ count: 1 });
    });

    it("creates rating and review count fields when present", async () => {
      prisma.lead.createMany.mockResolvedValue({ count: 1 });

      await caller.leads.bulkCreate([
        { company: "Acme", rating: 4.6, reviewCount: 128, status: "NOT_CONTACTED" },
      ]);

      expect(prisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          {
            company: "Acme",
            rating: 4.6,
            reviewCount: 128,
            status: "NOT_CONTACTED",
            organizationId: "org-1",
            assignedToId: "user-1",
          },
        ],
      });
    });

    it("updates existing review fields when fresher import data arrives", async () => {
      prisma.lead.findMany.mockResolvedValue([
        {
          id: "lead-1",
          email: "a@example.com",
          phone: null,
          status: "NOT_CONTACTED",
          rating: 4.1,
          reviewCount: 12,
        },
      ]);
      prisma.lead.update.mockResolvedValue({ id: "lead-1" });
      prisma.$transaction.mockResolvedValue([{ id: "lead-1" }]);

      await caller.leads.bulkCreate([
        { email: "a@example.com", rating: 4.8, reviewCount: 44, status: "NOT_CONTACTED" },
      ]);

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: expect.objectContaining({
          email: "a@example.com",
          rating: 4.8,
          reviewCount: 44,
        }),
      });
    });

    it("rejects empty arrays", async () => {
      await expect(caller.leads.bulkCreate([])).rejects.toThrow();
    });

    it("rejects payloads larger than 5000 rows", async () => {
      const big = Array.from({ length: 5001 }, () => ({ status: "NOT_CONTACTED" as const }));
      await expect(caller.leads.bulkCreate(big)).rejects.toThrow();
    });
  });

  describe("authorization", () => {
    it("rejects unauthenticated callers", async () => {
      const { caller: anon } = createTestCaller({ session: null });
      await expect(anon.leads.getAll()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  describe("updateCallOutcome", () => {
    it("maps the built-in ANSWERED outcome to a CONNECTED lead status", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
      prisma.lead.update.mockResolvedValue({ id: "lead-1" });

      await caller.leads.updateCallOutcome({ id: "lead-1", callOutcome: "ANSWERED" });

      const args = prisma.lead.update.mock.calls[0][0];
      expect(args.data.callOutcome).toBe("ANSWERED");
      expect(args.data.status).toBe("CONNECTED");
      expect(args.data.customOutcomeId).toBeNull();
    });

    it("does not mark a lead as CONNECTED when a custom outcome is selected", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
      prisma.customOutcome.findFirst.mockResolvedValue({ id: "outcome-1" });
      prisma.lead.update.mockResolvedValue({ id: "lead-1" });

      await caller.leads.updateCallOutcome({
        id: "lead-1",
        callOutcome: "CUSTOM",
        customOutcomeId: "outcome-1",
      });

      const args = prisma.lead.update.mock.calls[0][0];
      expect(args.data.callOutcome).toBe("CUSTOM");
      expect(args.data.status).not.toBe("CONNECTED");
      expect(args.data.customOutcomeId).toBe("outcome-1");
    });

    it("requires a customOutcomeId when callOutcome is CUSTOM", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });

      await expect(
        caller.leads.updateCallOutcome({ id: "lead-1", callOutcome: "CUSTOM" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("clears any previously linked customOutcomeId when switching to a built-in outcome", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
      prisma.lead.update.mockResolvedValue({ id: "lead-1" });

      await caller.leads.updateCallOutcome({ id: "lead-1", callOutcome: "NO_ANSWER" });

      const args = prisma.lead.update.mock.calls[0][0];
      expect(args.data.customOutcomeId).toBeNull();
      expect(args.data.status).toBe("NO_ANSWER");
    });
  });

  describe("updateTemperatureOverride", () => {
    it("updates the lead override when the lead is in scope", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
      prisma.lead.update.mockResolvedValue({ id: "lead-1", temperatureOverride: "HOT" });

      const result = await caller.leads.updateTemperatureOverride({
        id: "lead-1",
        temperatureOverride: "HOT",
      });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { temperatureOverride: "HOT" },
      });
      expect(result).toEqual({ id: "lead-1", temperatureOverride: "HOT" });
    });

    it("rejects override updates for leads outside the caller scope", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        caller.leads.updateTemperatureOverride({
          id: "lead-1",
          temperatureOverride: "COOL",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("updateCallOutcome", () => {
    it("counts the first standard call outcome as a lead touch", async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: "lead-1",
        organizationId: "org-1",
        callOutcome: "NOT_CONTACTED",
      });
      prisma.lead.update.mockResolvedValue({ id: "lead-1", callOutcome: "ANSWERED", status: "CONNECTED" });

      await caller.leads.updateCallOutcome({
        id: "lead-1",
        callOutcome: "ANSWERED",
      });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1", organizationId: "org-1" },
        data: {
          callOutcome: "ANSWERED",
          callNotes: undefined,
          customOutcomeId: null,
          status: "CONNECTED",
          touchCount: { increment: 1 },
          lastTouchedAt: expect.any(Date),
        },
      });
      expect(prisma.activity.create).toHaveBeenCalledWith({
        data: {
          leadId: "lead-1",
          userId: "user-1",
          type: "CALL_OUTCOME",
          description: "Marked call outcome as answered",
          organizationId: "org-1",
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("counts the first custom call outcome as a lead touch without forcing connected status", async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: "lead-1",
        organizationId: "org-1",
        status: "NO_ANSWER",
        callOutcome: "NOT_CONTACTED",
      });
      prisma.customOutcome.findFirst.mockResolvedValue({ id: "custom-1" });
      prisma.lead.update.mockResolvedValue({
        id: "lead-1",
        callOutcome: "CUSTOM",
        customOutcomeId: "custom-1",
      });

      await caller.leads.updateCallOutcome({
        id: "lead-1",
        callOutcome: "CUSTOM",
        customOutcomeId: "custom-1",
      });

      expect(prisma.customOutcome.findFirst).toHaveBeenCalledWith({
        where: { id: "custom-1", organizationId: "org-1" },
        select: { id: true },
      });
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1", organizationId: "org-1" },
        data: {
          callOutcome: "CUSTOM",
          callNotes: undefined,
          customOutcomeId: "custom-1",
          touchCount: { increment: 1 },
          lastTouchedAt: expect.any(Date),
        },
      });
    });

    it("does not add another touch when editing an existing outcome", async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: "lead-1",
        organizationId: "org-1",
        callOutcome: "ANSWERED",
      });
      prisma.lead.update.mockResolvedValue({ id: "lead-1", callOutcome: "NO_ANSWER" });

      await caller.leads.updateCallOutcome({
        id: "lead-1",
        callOutcome: "NO_ANSWER",
      });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1", organizationId: "org-1" },
        data: {
          callOutcome: "NO_ANSWER",
          callNotes: undefined,
          customOutcomeId: null,
          status: "NO_ANSWER",
        },
      });
      expect(prisma.activity.create).toHaveBeenCalledWith({
        data: {
          leadId: "lead-1",
          userId: "user-1",
          type: "CALL_OUTCOME",
          description: "Marked call outcome as no answer",
          organizationId: "org-1",
        },
      });
    });
  });
});
