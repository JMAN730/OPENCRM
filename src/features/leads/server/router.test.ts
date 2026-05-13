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

      await caller.leads.getAll();

      expect(prisma.lead.findMany).toHaveBeenCalledTimes(1);
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.organizationId).toBe("org-1");
    });

    it("applies search across company, name, email, phone", async () => {
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

    it("returns leads ordered by createdAt desc", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await caller.leads.getAll();
      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ createdAt: "desc" });
    });

    it("treats whitespace-only search as no search (no OR clause)", async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      await caller.leads.getAll({ search: "   " });

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.OR).toBeUndefined();
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
      prisma.$transaction.mockResolvedValue([{}, { id: "lead-1" }] as any);

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
});
