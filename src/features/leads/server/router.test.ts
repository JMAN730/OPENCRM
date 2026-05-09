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

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: { id: "lead-1", organizationId: "org-1" },
      });
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

  describe("create", () => {
    it("attaches organizationId and assignedToId from the session", async () => {
      prisma.lead.create.mockResolvedValue({ id: "lead-1" });

      await caller.leads.create({
        firstName: "John",
        lastName: "Doe",
        status: "NEW",
      });

      expect(prisma.lead.create).toHaveBeenCalledWith({
        data: {
          firstName: "John",
          lastName: "Doe",
          status: "NEW",
          organizationId: "org-1",
          assignedToId: "user-1",
        },
      });
    });

    it("rejects callers without an organization", async () => {
      const { caller: orphanCaller } = createTestCaller({
        sessionOverrides: { organizationId: null },
      });

      await expect(orphanCaller.leads.create({ status: "NEW" })).rejects.toMatchObject({
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
        { firstName: "A", status: "NEW" },
        { firstName: "B", status: "NEW" },
      ]);

      expect(prisma.lead.createMany).toHaveBeenCalledWith({
        data: [
          { firstName: "A", status: "NEW", organizationId: "org-1", assignedToId: "user-1" },
          { firstName: "B", status: "NEW", organizationId: "org-1", assignedToId: "user-1" },
        ],
      });
      expect(result).toEqual({ count: 2 });
    });

    it("rejects empty arrays", async () => {
      await expect(caller.leads.bulkCreate([])).rejects.toThrow();
    });

    it("rejects payloads larger than 5000 rows", async () => {
      const big = Array.from({ length: 5001 }, () => ({ status: "NEW" as const }));
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
