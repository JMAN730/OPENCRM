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
        data: expect.objectContaining({
          userId: "user-1",
          title: "Call back",
          description: undefined,
          dueDate: undefined,
          leadId: undefined,
          priority: "MEDIUM",
          status: "PENDING",
          organizationId: "org-1",
        }),
      });
    });

    it("defaults assignedToId to the creator when not provided", async () => {
      prisma.task.create.mockResolvedValue({ id: "t1" });

      await caller.tasks.create({ title: "Call back" });

      const data = prisma.task.create.mock.calls[0][0].data;
      expect(data.assignedToId).toBe("user-1");
    });

    it("uses provided assignedToId when specified", async () => {
      prisma.task.create.mockResolvedValue({ id: "t1" });

      await caller.tasks.create({ title: "Delegate task", assignedToId: "user-2" });

      const data = prisma.task.create.mock.calls[0][0].data;
      expect(data.assignedToId).toBe("user-2");
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

    it("passes status=COMPLETED through to Prisma", async () => {
      prisma.task.create.mockResolvedValue({ id: "t1" });

      await caller.tasks.create({ title: "Done already", status: "COMPLETED" });

      const data = prisma.task.create.mock.calls[0][0].data;
      expect(data.status).toBe("COMPLETED");
    });
  });

  describe("update", () => {
    it("scopes the lookup to the caller's organization and excludes soft-deleted", async () => {
      prisma.task.findFirst.mockResolvedValue({ id: "t1", userId: "user-1", leadId: null, title: "t" });
      prisma.task.update.mockResolvedValue({ id: "t1", title: "t" });

      await caller.tasks.update({ taskId: "t1", completed: true });

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: "t1",
          user: { organizationId: "org-1" },
          deletedAt: null,
        },
        select: { id: true, userId: true, leadId: true, title: true },
      });
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
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
      prisma.task.findFirst.mockResolvedValue({ id: "t1", userId: "another-user", leadId: null, title: "t" });
      prisma.task.update.mockResolvedValue({ id: "t1", title: "t" });

      await caller.tasks.update({ taskId: "t1", completed: true });

      expect(prisma.task.update).toHaveBeenCalled();
    });

    it("forbids a USER from editing another user's task even in the same org", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      prisma.task.findFirst.mockResolvedValue({ id: "t1", userId: "another-user", leadId: null, title: "t" });

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

    it("passes status=PENDING through to Prisma on status update", async () => {
      prisma.task.findFirst.mockResolvedValue({ id: "t1", userId: "user-1", leadId: null, title: "t" });
      prisma.task.update.mockResolvedValue({ id: "t1", title: "t" });

      await caller.tasks.update({ taskId: "t1", status: "PENDING" });

      const data = prisma.task.update.mock.calls[0][0].data;
      expect(data.status).toBe("PENDING");
    });
  });

  describe("delete", () => {
    it("scopes deletes to the caller's organization and performs soft delete", async () => {
      prisma.task.findFirst.mockResolvedValue({ id: "t1", userId: "user-1" });
      prisma.task.update.mockResolvedValue({ id: "t1" });

      await caller.tasks.delete({ taskId: "t1" });

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: "t1",
          user: { organizationId: "org-1" },
          deletedAt: null,
        },
        select: { id: true, userId: true },
      });
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.task.delete).not.toHaveBeenCalled();
    });

    it("returns NOT_FOUND when the task belongs to another organization", async () => {
      prisma.task.findFirst.mockResolvedValue(null);

      await expect(
        caller.tasks.delete({ taskId: "t1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it("forbids a USER from deleting another user's task", async () => {
      const { caller, prisma } = createTestCaller({
        sessionOverrides: { role: "USER" },
      });
      prisma.task.findFirst.mockResolvedValue({ id: "t1", userId: "another-user" });

      await expect(
        caller.tasks.delete({ taskId: "t1" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(prisma.task.update).not.toHaveBeenCalled();
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

    it("excludes soft-deleted tasks", async () => {
      prisma.lead.findUnique.mockResolvedValue({ organizationId: "org-1" });
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAllForLead({ leadId: "lead-1" });

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where).toMatchObject({ leadId: "lead-1", deletedAt: null });
    });
  });

  describe("getById", () => {
    it("scopes the lookup to the caller's organization and excludes soft-deleted tasks", async () => {
      prisma.task.findFirst.mockResolvedValue({ id: "task-1", title: "Call back" });

      await caller.tasks.getById({ taskId: "task-1" });

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: "task-1",
          user: { organizationId: "org-1" },
          deletedAt: null,
        },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, company: true } },
          user: { select: { id: true, name: true, image: true } },
          assignedTo: { select: { id: true, name: true, image: true } },
        },
      });
    });
  });

  describe("getDueToday", () => {
    it("filters by user.organizationId, excludes COMPLETED, takes 5, excludes deleted", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getDueToday();

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where.user).toEqual({ organizationId: "org-1" });
      expect(args.where.status).toEqual({ not: "COMPLETED" });
      expect(args.where.deletedAt).toBe(null);
      expect(args.take).toBe(5);
    });
  });

  describe("getAll", () => {
    it("scopes to the caller's organization and excludes soft-deleted", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAll();

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ user: { organizationId: "org-1" }, deletedAt: null });
    });

    it("returns paginated shape { items, nextCursor }", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      const result = await caller.tasks.getAll();

      expect(result).toEqual({ items: [], nextCursor: null });
    });

    it("orders by (status asc, dueDate asc, id asc) for stable cursor paging", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAll();

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual([
        { status: "asc" },
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

    it("filters by status when supplied", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAll({ status: "PENDING" });

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where.status).toBe("PENDING");
    });

    it("filters by assignedToId when supplied", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAll({ assignedToId: "user-2" });

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where.assignedToId).toBe("user-2");
    });

    it("filters by status when supplied", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAll({ status: "PENDING" });

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where.status).toBe("PENDING");
    });

    it("passes the cursor to Prisma with skip-1 on subsequent pages", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getAll({ cursor: "t-99" });

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.cursor).toEqual({ id: "t-99" });
      expect(args.skip).toBe(1);
    });
  });

  describe("getOverdue", () => {
    it("filters by status not COMPLETED, dueDate before today, excludes deleted", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getOverdue();

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where.status).toEqual({ not: "COMPLETED" });
      expect(args.where.deletedAt).toBe(null);
      expect(args.where.dueDate).toMatchObject({ lt: expect.any(Date) });
    });
  });

  describe("getUpcomingFollowUps", () => {
    it("filters to open future tasks scoped to the org and only with a leadId", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      await caller.tasks.getUpcomingFollowUps();

      const args = prisma.task.findMany.mock.calls[0][0];
      expect(args.where.user).toEqual({ organizationId: "org-1" });
      expect(args.where.status).toEqual({ not: "COMPLETED" });
      expect(args.where.deletedAt).toBe(null);
      expect(args.where.leadId).toEqual({ not: null });
      expect(args.where.dueDate).toMatchObject({ gte: expect.any(Date) });
      expect(args.orderBy).toEqual({ dueDate: "asc" });
    });

    it("returns only the earliest task per lead", async () => {
      prisma.task.findMany.mockResolvedValue([
        { id: "early", leadId: "lead-a", dueDate: new Date("2026-06-01") },
        { id: "later", leadId: "lead-a", dueDate: new Date("2026-06-05") },
        { id: "other", leadId: "lead-b", dueDate: new Date("2026-06-03") },
      ]);

      const result = await caller.tasks.getUpcomingFollowUps();

      expect(result.map((t: { id: string }) => t.id)).toEqual(["early", "other"]);
    });
  });
});
