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

    it("applies general search across company, name, email, phone, city", async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      await caller.leads.getAll({ search: "acme" });

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { company: { contains: "acme", mode: "insensitive" } },
        { firstName: { contains: "acme", mode: "insensitive" } },
        { lastName: { contains: "acme", mode: "insensitive" } },
        { email: { contains: "acme", mode: "insensitive" } },
        { phone: { contains: "acme", mode: "insensitive" } },
        { city: { contains: "acme", mode: "insensitive" } },
      ]);
    });

    it("matches the city column for a bare city search (no state)", async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      await caller.leads.getAll({ search: "Austin" });

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.OR).toContainEqual({
        city: { contains: "Austin", mode: "insensitive" },
      });
      // A bare city name resolves to no state, so there is no AND/state clause.
      expect(args.where.OR.some((clause: Record<string, unknown>) => "AND" in clause)).toBe(false);
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
        { city: { contains: "FL", mode: "insensitive" } },
        { AND: [{ state: "FL" }] },
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
        { city: { contains: "Tampa FL", mode: "insensitive" } },
        {
          AND: [
            { state: "FL" },
            { city: { contains: "Tampa", mode: "insensitive" } },
          ],
        },
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
        { city: { contains: "Tampa, Florida", mode: "insensitive" } },
        {
          AND: [
            { state: "FL" },
            { city: { contains: "Tampa", mode: "insensitive" } },
          ],
        },
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

  describe("getStatusCounts", () => {
    it("uses Prisma 7-compatible call outcome filters", async () => {
      prisma.lead.groupBy
        .mockResolvedValueOnce([{ status: "CONNECTED", _count: { id: 3 } }])
        .mockResolvedValueOnce([{ customOutcomeId: "co-1", _count: { id: 2 } }]);
      prisma.lead.count.mockResolvedValue(5);

      const result = await caller.leads.getStatusCounts();

      expect(prisma.lead.groupBy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          by: ["status"],
          where: {
            AND: [
              { organizationId: "org-1" },
              { callOutcome: { notIn: ["NOT_CONTACTED", "CUSTOM"] } },
            ],
          },
        }),
      );
      expect(prisma.lead.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { organizationId: "org-1" },
              { callOutcome: "NOT_CONTACTED" },
            ],
          },
        }),
      );
      expect(result).toEqual({ NOT_CONTACTED: 5, CONNECTED: 3, "CUSTOM:co-1": 2 });
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

    it("coerces a numeric string value into a number", async () => {
      prisma.lead.create.mockResolvedValue({ id: "lead-1" });

      await caller.leads.create({ company: "Acme", status: "NOT_CONTACTED", value: "2500" });

      const args = prisma.lead.create.mock.calls[0][0];
      expect(args.data.value).toBe(2500);
    });

    it("treats an empty-string value as absent", async () => {
      prisma.lead.create.mockResolvedValue({ id: "lead-1" });

      await caller.leads.create({ company: "Acme", status: "NOT_CONTACTED", value: "" });

      const args = prisma.lead.create.mock.calls[0][0];
      expect(args.data.value).toBeUndefined();
    });
  });

  describe("bulkCreate", () => {
    it("attaches org/user to every row", async () => {
      prisma.lead.createManyAndReturn.mockResolvedValue([{ id: "lead-1" }, { id: "lead-2" }]);

      const result = await caller.leads.bulkCreate({
        leads: [
          { firstName: "A", status: "NOT_CONTACTED" },
          { firstName: "B", status: "NOT_CONTACTED" },
        ],
      });

      expect(prisma.lead.findMany).not.toHaveBeenCalled();
      expect(prisma.lead.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          { firstName: "A", status: "NOT_CONTACTED", organizationId: "org-1", assignedToId: "user-1" },
          { firstName: "B", status: "NOT_CONTACTED", organizationId: "org-1", assignedToId: "user-1" },
        ],
        select: { id: true },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ count: 2 });
    });

    it("updates an existing lead (matched by email) instead of duplicating", async () => {
      prisma.lead.findMany.mockResolvedValue([
        { id: "lead-1", email: "a@example.com", phone: null, status: "CONNECTED" },
      ]);
      prisma.lead.update.mockResolvedValue({ id: "lead-1" });

      const result = await caller.leads.bulkCreate({
        leads: [{ email: "A@EXAMPLE.COM", phone: "", company: "Acme", status: "NOT_CONTACTED" }],
      });

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
      prisma.lead.createManyAndReturn.mockResolvedValue([{ id: "lead-1" }]);

      await caller.leads.bulkCreate({
        leads: [{ company: "Acme", rating: 4.6, reviewCount: 128, status: "NOT_CONTACTED" }],
      });

      expect(prisma.lead.createManyAndReturn).toHaveBeenCalledWith({
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
        select: { id: true },
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

      await caller.leads.bulkCreate({
        leads: [{ email: "a@example.com", rating: 4.8, reviewCount: 44, status: "NOT_CONTACTED" }],
      });

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
      await expect(caller.leads.bulkCreate({ leads: [] })).rejects.toThrow();
    });

    it("rejects payloads larger than 5000 rows", async () => {
      const big = Array.from({ length: 5001 }, () => ({ status: "NOT_CONTACTED" as const }));
      await expect(caller.leads.bulkCreate({ leads: big })).rejects.toThrow();
    });

    it("assigns to specified user when assigneeId provided (admin caller)", async () => {
      prisma.user.findFirst.mockResolvedValue({ id: "user-2", organizationId: "org-1" });
      prisma.lead.createManyAndReturn.mockResolvedValue([{ id: "lead-new" }]);

      await caller.leads.bulkCreate({
        leads: [{ firstName: "A", status: "NOT_CONTACTED" }],
        assigneeId: "user-2",
      });

      expect(prisma.lead.createManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ assignedToId: "user-2" })],
        }),
      );
    });

    it("rejects assigneeId to other user from non-manager/admin caller", async () => {
      const { caller: userCaller } = createTestCaller({ sessionOverrides: { role: "USER" } });
      await expect(
        userCaller.leads.bulkCreate({
          leads: [{ firstName: "A", status: "NOT_CONTACTED" }],
          assigneeId: "user-2",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("applies tags to all affected leads when tagIds provided", async () => {
      prisma.leadTag.findMany.mockResolvedValue([{ id: "tag-1" }]);
      prisma.lead.createManyAndReturn.mockResolvedValue([{ id: "lead-new" }]);

      await caller.leads.bulkCreate({
        leads: [{ firstName: "A", status: "NOT_CONTACTED" }],
        tagIds: ["tag-1"],
      });

      expect(prisma.leadTag.update).toHaveBeenCalledWith({
        where: { id: "tag-1" },
        data: { leads: { connect: [{ id: "lead-new" }] } },
      });
    });

    it("rejects when a tagId does not belong to the org", async () => {
      prisma.leadTag.findMany.mockResolvedValue([]); // tag not found in org
      await expect(
        caller.leads.bulkCreate({
          leads: [{ firstName: "A", status: "NOT_CONTACTED" }],
          tagIds: ["bad-tag"],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("authorization", () => {
    it("rejects unauthenticated callers", async () => {
      const { caller: anon } = createTestCaller({ session: null });
      await expect(anon.leads.getAll()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  describe("update", () => {
    it("updates editable lead fields when the lead is in scope", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
      prisma.lead.update.mockResolvedValue({ id: "lead-1" });

      await caller.leads.update({
        id: "lead-1",
        firstName: "Jane",
        company: "Acme",
        email: "jane@acme.com",
        status: "CONNECTED",
      });

      const args = prisma.lead.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: "lead-1", organizationId: "org-1" });
      expect(args.data.firstName).toBe("Jane");
      expect(args.data.company).toBe("Acme");
      expect(args.data.email).toBe("jane@acme.com");
      expect(args.data.status).toBe("CONNECTED");
    });

    it("throws NOT_FOUND when the lead is out of scope", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        caller.leads.update({ id: "missing", firstName: "X" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(prisma.lead.update).not.toHaveBeenCalled();
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

  describe("updateValue", () => {
    it("updates the estimated value when the lead is in scope", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
      prisma.lead.update.mockResolvedValue({ id: "lead-1", value: 2500 });

      const result = await caller.leads.updateValue({ id: "lead-1", value: 2500 });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { value: 2500 },
      });
      expect(result).toEqual({ id: "lead-1", value: 2500 });
    });

    it("clears the value when passed null", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
      prisma.lead.update.mockResolvedValue({ id: "lead-1", value: null });

      await caller.leads.updateValue({ id: "lead-1", value: null });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { value: null },
      });
    });

    it("rejects value updates for leads outside the caller scope", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        caller.leads.updateValue({ id: "lead-1", value: 100 }),
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

    it("counts each non-NOT_CONTACTED outcome as a touch, enabling touch depth > 1", async () => {
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
          touchCount: { increment: 1 },
          lastTouchedAt: expect.any(Date),
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

  describe("lead tags", () => {
    it("upserts tags by normalized key to prevent case-insensitive duplicates", async () => {
      prisma.leadTag.upsert.mockResolvedValue({ id: "tag-1", name: "Priority" });

      const result = await caller.leads.createTag({ name: "priority" });

      expect(result).toEqual({ id: "tag-1", name: "Priority" });
      expect(prisma.leadTag.upsert).toHaveBeenCalledWith({
        where: {
          organizationId_tagKey: {
            organizationId: "org-1",
            tagKey: "priority",
          },
        },
        update: {},
        create: { name: "priority", tagKey: "priority", organizationId: "org-1" },
        select: { id: true, name: true },
      });
    });

    it("connects only scoped leads to organization tags", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
      prisma.leadTag.findFirst.mockResolvedValue({ id: "tag-1" });
      prisma.lead.update.mockResolvedValue({ id: "lead-1", tags: [{ id: "tag-1", name: "Priority" }] });

      await caller.leads.addTagToLead({ leadId: "lead-1", tagId: "tag-1" });

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: { id: "lead-1", organizationId: "org-1" },
        select: { id: true },
      });
      expect(prisma.leadTag.findFirst).toHaveBeenCalledWith({
        where: { id: "tag-1", organizationId: "org-1" },
        select: { id: true },
      });
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "lead-1" },
          data: { tags: { connect: { id: "tag-1" } } },
        }),
      );
    });

    it("stores a generated qualification summary on the scoped lead", async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: "lead-1",
        firstName: null,
        lastName: null,
        company: "Big Rapids Fleet",
        city: "Big Rapids",
        state: "MI",
        source: "Mobile Mechanics",
        phone: "1234567890",
        email: null,
        website: null,
        rating: 4.3,
        reviewCount: 6,
        status: "NOT_CONTACTED",
        callOutcome: "NOT_CONTACTED",
        temperatureOverride: "COOL",
      });
      prisma.lead.update.mockResolvedValue({ id: "lead-1", qualificationSummary: "summary" });

      await caller.leads.qualify({ id: "lead-1" });

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "lead-1" },
          data: {
            qualificationSummary: expect.stringContaining("Big Rapids Fleet in Big Rapids, MI"),
          },
        }),
      );
      expect(prisma.activity.create).toHaveBeenCalledWith({
        data: {
          leadId: "lead-1",
          userId: "user-1",
          type: "LEAD_QUALIFIED",
          description: "Generated lead qualification summary",
          organizationId: "org-1",
        },
      });
    });
  });

  describe("export", () => {
    it("returns a CSV string with headers", async () => {
      prisma.lead.findMany.mockResolvedValue([
        {
          id: "lead-1",
          firstName: "Alice",
          lastName: "Smith",
          company: "Acme",
          email: "alice@acme.com",
          phone: "555-1234",
          city: "Tampa",
          state: "FL",
          status: "CONNECTED",
          callOutcome: "ANSWERED",
          rating: 4.5,
          reviewCount: 20,
          source: "Google Maps",
          website: "acme.com",
          assignedTo: { name: "Bob", email: "bob@crm.com" },
          createdAt: new Date("2026-01-01"),
        },
      ]);

      const result = await caller.leads.export({});

      expect(result.count).toBe(1);
      const lines = result.csv.split("\n");
      expect(lines[0]).toContain("First Name");
      expect(lines[1]).toContain("Alice");
      expect(lines[1]).toContain("Acme");
    });

    it("escapes commas and quotes in field values", async () => {
      prisma.lead.findMany.mockResolvedValue([
        {
          id: "lead-2",
          company: 'Smith, "The Best" LLC',
          firstName: null,
          lastName: null,
          email: null,
          phone: null,
          city: null,
          state: null,
          status: "NOT_CONTACTED",
          callOutcome: null,
          rating: null,
          reviewCount: null,
          source: null,
          website: null,
          assignedTo: null,
          createdAt: new Date("2026-01-01"),
        },
      ]);

      const result = await caller.leads.export({});
      expect(result.csv).toContain('"Smith, ""The Best"" LLC"');
    });
  });

  describe("bulkSetTemperature", () => {
    it("updates temperature for all visible leads", async () => {
      prisma.lead.findMany.mockResolvedValue([{ id: "lead-1" }, { id: "lead-2" }]);
      prisma.lead.updateMany.mockResolvedValue({ count: 2 });
      prisma.activity.createMany.mockResolvedValue({ count: 2 });

      const result = await caller.leads.bulkSetTemperature({
        leadIds: ["lead-1", "lead-2"],
        temperature: "HOT",
      });

      expect(prisma.lead.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["lead-1", "lead-2"] } },
        data: { temperatureOverride: "HOT" },
      });
      expect(result.count).toBe(2);
    });

    it("rejects when one of the leads is outside the caller scope", async () => {
      prisma.lead.findMany.mockResolvedValue([{ id: "lead-1" }]);

      await expect(
        caller.leads.bulkSetTemperature({ leadIds: ["lead-1", "lead-other"], temperature: "WARM" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(prisma.lead.updateMany).not.toHaveBeenCalled();
    });

    it("clears the override when temperature is null", async () => {
      prisma.lead.findMany.mockResolvedValue([{ id: "lead-1" }]);
      prisma.lead.updateMany.mockResolvedValue({ count: 1 });
      prisma.activity.createMany.mockResolvedValue({ count: 1 });

      await caller.leads.bulkSetTemperature({ leadIds: ["lead-1"], temperature: null });

      expect(prisma.lead.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["lead-1"] } },
        data: { temperatureOverride: null },
      });
    });
  });

  describe("generateQualification", () => {
    it("uses heuristic fallback when DEEPSEEK_API_KEY is not set", async () => {
      delete process.env.DEEPSEEK_API_KEY;

      const leadFixture = {
        id: "lead-1",
        organizationId: "org-1",
        firstName: "Alice",
        lastName: "Smith",
        company: "Acme",
        city: "Tampa",
        state: "FL",
        rating: 4.8,
        reviewCount: 120,
        status: "CONNECTED",
        callOutcome: "ANSWERED",
        source: "Google Maps",
        phone: "555-0000",
        email: "alice@acme.com",
        qualificationSummary: null,
        assignedTo: null,
      };
      prisma.lead.findFirst.mockResolvedValue(leadFixture);
      prisma.lead.update.mockResolvedValue({ ...leadFixture, qualificationSummary: "summary" });

      const result = await caller.leads.generateQualification({ id: "lead-1" });

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ qualificationSummary: expect.any(String) }) }),
      );
      expect(result.summary).toBeTruthy();
    });

    it("throws NOT_FOUND when lead is outside caller scope", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(caller.leads.generateQualification({ id: "other-lead" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("listOrgTags", () => {
    it("returns org tags ordered by name", async () => {
      prisma.leadTag.findMany.mockResolvedValue([
        { id: "tag-1", name: "Hot" },
        { id: "tag-2", name: "VIP" },
      ]);
      const result = await caller.leads.listOrgTags();
      expect(result).toHaveLength(2);
      expect(prisma.leadTag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: "org-1" } }),
      );
    });
  });

  describe("createTag", () => {
    it("upserts a tag and returns id + name", async () => {
      prisma.leadTag.count.mockResolvedValue(5);
      prisma.leadTag.upsert.mockResolvedValue({ id: "tag-new", name: "Prospect" });
      const result = await caller.leads.createTag({ name: "Prospect" });
      expect(result).toEqual({ id: "tag-new", name: "Prospect" });
    });

    it("throws BAD_REQUEST when org already has 100 tags", async () => {
      prisma.leadTag.count.mockResolvedValue(100);
      await expect(caller.leads.createTag({ name: "Too Many" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
  });

  describe("deleteTag", () => {
    it("deletes an org-scoped tag", async () => {
      prisma.leadTag.findFirst.mockResolvedValue({ id: "tag-1", name: "Old" });
      prisma.leadTag.delete.mockResolvedValue({});
      const result = await caller.leads.deleteTag({ id: "tag-1" });
      expect(result).toEqual({ ok: true });
    });

    it("throws NOT_FOUND for tags outside the org", async () => {
      prisma.leadTag.findFirst.mockResolvedValue(null);
      await expect(caller.leads.deleteTag({ id: "tag-other" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("getLeadTags", () => {
    it("returns tags for a lead in scope", async () => {
      prisma.lead.findFirst.mockResolvedValue({
        tags: [{ id: "tag-1", name: "VIP" }],
      });
      const result = await caller.leads.getLeadTags({ leadId: "lead-1" });
      expect(result).toEqual([{ id: "tag-1", name: "VIP" }]);
    });

    it("throws NOT_FOUND when lead is outside scope", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(caller.leads.getLeadTags({ leadId: "other" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("addTagToLead", () => {
    it("connects a tag to a lead", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
      prisma.leadTag.findFirst.mockResolvedValue({ id: "tag-1" });
      prisma.lead.update.mockResolvedValue({});
      const result = await caller.leads.addTagToLead({ leadId: "lead-1", tagId: "tag-1" });
      expect(result).toEqual({ ok: true });
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { tags: { connect: { id: "tag-1" } } },
        }),
      );
    });

    it("throws NOT_FOUND when lead is outside scope", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        caller.leads.addTagToLead({ leadId: "other", tagId: "tag-1" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("removeTagFromLead", () => {
    it("disconnects a tag from a lead", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
      prisma.lead.update.mockResolvedValue({});
      const result = await caller.leads.removeTagFromLead({ leadId: "lead-1", tagId: "tag-1" });
      expect(result).toEqual({ ok: true });
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { tags: { disconnect: { id: "tag-1" } } },
        }),
      );
    });

    it("throws NOT_FOUND when lead is outside scope", async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        caller.leads.removeTagFromLead({ leadId: "other", tagId: "tag-1" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("bulkAddTag", () => {
    it("connects a tag to all scope-allowed leads", async () => {
      prisma.leadTag.findFirst.mockResolvedValue({ id: "tag-1" });
      prisma.lead.findMany.mockResolvedValue([{ id: "lead-1" }, { id: "lead-2" }]);

      const result = await caller.leads.bulkAddTag({ leadIds: ["lead-1", "lead-2"], tagId: "tag-1" });

      expect(result).toEqual({ count: 2 });
      expect(prisma.leadTag.update).toHaveBeenCalledWith({
        where: { id: "tag-1" },
        data: { leads: { connect: [{ id: "lead-1" }, { id: "lead-2" }] } },
      });
    });

    it("throws NOT_FOUND when tagId is not in the org", async () => {
      prisma.leadTag.findFirst.mockResolvedValue(null);
      await expect(
        caller.leads.bulkAddTag({ leadIds: ["lead-1"], tagId: "bad-tag" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws FORBIDDEN when any leadId is outside caller scope", async () => {
      prisma.leadTag.findFirst.mockResolvedValue({ id: "tag-1" });
      // Scope check returns only 1 lead, but 2 were requested
      prisma.lead.findMany.mockResolvedValue([{ id: "lead-1" }]);
      await expect(
        caller.leads.bulkAddTag({ leadIds: ["lead-1", "outside-lead"], tagId: "tag-1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
