import { beforeEach, describe, expect, it } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("tasksRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
  });

  describe("create", () => {
    it("creates a task without a leadId", async () => {
      prisma.task.create.mockResolvedValue({ id: "t1" });

      await caller.tasks.create({ title: "Call back" });

      expect(prisma.task.create).toHaveBeenCalledWith({
        data: {
          leadId: undefined,
          userId: "user-1",
          title: "Call back",
          description: undefined,
          dueDate: undefined,
        },
      });
    });

    it("checks lead org ownership when leadId is supplied", async () => {
      prisma.lead.findUnique.mockResolvedValue({ organizationId: "org-1" });
      prisma.task.create.mockResolvedValue({ id: "t1" });

      await caller.tasks.create({ title: "Follow up", leadId: "lead-1" });

      expect(prisma.lead.findUnique).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        select: { organizationId: true },
      });
      expect(prisma.task.create).toHaveBeenCalled();
    });

    it("refuses when leadId points at another org", async () => {
      prisma.lead.findUnique.mockResolvedValue({ organizationId: "other-org" });

      await expect(
        caller.tasks.create({ title: "x", leadId: "lead-1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it("parses ISO dueDate to a Date", async () => {
      prisma.task.create.mockResolvedValue({ id: "t1" });

      await caller.tasks.create({ title: "x", dueDate: "2026-06-01T12:00:00.000Z" });

      const data = prisma.task.create.mock.calls[0][0].data;
      expect(data.dueDate).toBeInstanceOf(Date);
      expect((data.dueDate as Date).toISOString()).toBe("2026-06-01T12:00:00.000Z");
    });

    it("rejects empty titles", async () => {
      await expect(caller.tasks.create({ title: "" })).rejects.toThrow();
    });

    it("rejects garbage dueDate strings", async () => {
      await expect(
        caller.tasks.create({ title: "x", dueDate: "not-a-date" })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("scopes the lookup to the caller's organization", async () => {
      prisma.task.findFirst.mockResolvedValue({ id: "t1", userId: "user-1" });
      prisma.task.update.mockResolvedValue({ id: "t1" });

      await caller.tasks.update({ taskId: "t1", completed: true });

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: "t1",
          user: { organizationId: "org-1" },
        },
        select: { id: true, userId: true },
      });
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { completed: true, title: undefined, dueDate: undefined },
      });
    });

    it("returns NOT_FOUND when the task belongs to a different org", async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        caller.tasks.update({ taskId: "t1", completed: true })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it("allows admins to edit any task within the same organization", async () => {
      prisma.task.findFirst.mockResolvedValue({ id: "t1", userId: "another-user" });
      prisma.task.update.mockResolvedValue({ id: "t1" });

      await caller.tasks.update({ taskId: "t1", completed: true });

      expect(prisma.task.update).toHaveBeenCalled();
    });

    it("forbids a USER from editing another user's task even in the same org", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      prisma.task.findFirst.mockResolvedValue({ id: "t1", userId: "another-user" });

      await expect(
        caller.tasks.update({ taskId: "t1", completed: true })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it("refuses when the task does not exist", async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        caller.tasks.update({ taskId: "missing", completed: true })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects garbage dueDate strings", async () => {
      await expect(
        caller.tasks.update({ taskId: "t1", dueDate: "not-a-date" })
      ).rejects.toThrow();
    });
  });

  describe("delete", () => {
    it("scopes deletes to the caller's organization", async () => {
      prisma.task.findFirst.mockResolvedValue({ id: "t1", userId: "user-1" });
      prisma.task.delete.mockResolvedValue({ id: "t1" });

      await caller.tasks.delete({ taskId: "t1" });

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: "t1",
          user: { organizationId: "org-1" },
        },
        select: { id: true, userId: true },
      });
      expect(prisma.task.delete).toHaveBeenCalledWith({
        where: { id: "t1" },
      });
    });

    it("returns NOT_FOUND when the task belongs to another organization", async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        caller.tasks.delete({ taskId: "t1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(prisma.task.delete).not.toHaveBeenCalled();
    });

    it("forbids a USER from deleting another user's task", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      prisma.task.findFirst.mockResolvedValue({ id: "t1", userId: "another-user" });

      await expect(
        caller.tasks.delete({ taskId: "t1" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(prisma.task.delete).not.toHaveBeenCalled();
    });
  });

  describe("getAllForLead", () => {
    it("verifies the lead belongs to the caller's org", async () => {
      prisma.lead.findUnique.mockResolvedValue({ organizationId: "org-1" });
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAllForLead({ leadId: "lead-1" });

      expect(prisma.task.findMany).toHaveBeenCalled();
    });

    it("refuses cross-tenant access", async () => {
      prisma.lead.findUnique.mockResolvedValue({ organizationId: "other-org" });

      await expect(
        caller.tasks.getAllForLead({ leadId: "lead-1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("getDueToday", () => {
    it("filters by user.organizationId, completed=false, takes 5", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getDueToday();

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where.user).toEqual({ organizationId: "org-1" });
      expect(args.where.completed).toBe(false);
      expect(args.take).toBe(5);
    });
  });

  describe("getAll", () => {
    it("scopes to the caller's organization", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAll();

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ user: { organizationId: "org-1" } });
    });

    it("returns paginated shape { items, nextCursor }", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      const result = await caller.tasks.getAll();

      expect(result).toEqual({ items: [], nextCursor: null });
    });

    it("orders by (completed asc, dueDate asc, id asc) for stable cursor paging", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAll();

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual([
        { completed: "asc" },
        { dueDate: "asc" },
        { id: "asc" },
      ]);
    });

    it("takes (limit + 1) and reports nextCursor when more rows exist", async () => {
      const rows = Array.from({ length: 51 }, (_, i) => ({ id: `t-${i}` }));
      prisma.task.findMany.mockResolvedValue(rows);

      const result = await caller.tasks.getAll({ limit: 50 });

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.take).toBe(51);
      expect(result.items).toHaveLength(50);
      expect(result.nextCursor).toBe("t-50");
    });

    it("filters by completed flag when supplied", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAll({ completed: false });

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where.completed).toBe(false);
    });

    it("passes the cursor to Prisma with skip-1 on subsequent pages", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAll({ cursor: "t-99" });

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.cursor).toEqual({ id: "t-99" });
      expect(args.skip).toBe(1);
    });
  });
});
