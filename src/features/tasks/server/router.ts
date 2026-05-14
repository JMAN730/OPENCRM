import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { isManagerOrAdmin } from "@/server/authz";
import { logActivity } from "@/server/activity";

const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
const statusSchema = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]);

export const tasksRouter = createTRPCRouter({
  create: organizationProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      leadId: z.string().optional(),
      assignedToId: z.string().optional(),
      dueDate: z.coerce.date().optional(),
      priority: prioritySchema.default("MEDIUM"),
      status: statusSchema.default("PENDING"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.leadId) {
        const lead = await ctx.prisma.lead.findUnique({
          where: { id: input.leadId },
          select: { organizationId: true },
        });
        if (!lead || lead.organizationId !== ctx.organizationId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
        }
      }

      const assignedToId = input.assignedToId ?? ctx.session.user.id;
      const status = input.status;

      const task = await ctx.prisma.task.create({
        data: {
          title: input.title,
          description: input.description,
          leadId: input.leadId,
          userId: ctx.session.user.id,
          assignedToId,
          dueDate: input.dueDate,
          priority: input.priority,
          status,
          completed: status === "COMPLETED",
          organizationId: ctx.organizationId,
        },
      });

      if (input.leadId) {
        await logActivity(ctx.prisma, {
          leadId: input.leadId,
          userId: ctx.session.user.id,
          type: "TASK_CREATED",
          description: `Task "${input.title}" created`,
        });
      }

      return task;
    }),

  update: organizationProcedure
    .input(z.object({
      taskId: z.string(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      assignedToId: z.string().nullable().optional(),
      leadId: z.string().nullable().optional(),
      dueDate: z.coerce.date().nullable().optional(),
      priority: prioritySchema.optional(),
      status: statusSchema.optional(),
      completed: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.prisma.task.findFirst({
        where: {
          id: input.taskId,
          user: { organizationId: ctx.organizationId },
          deletedAt: null,
        },
        select: { id: true, userId: true, leadId: true, title: true },
      });

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      }

      const callerId = ctx.session.user.id;
      const callerRole = ctx.session.user.role;
      if (task.userId !== callerId && !isManagerOrAdmin(callerRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot edit another user's task." });
      }

      // Sync completed <-> status
      let completed = input.completed;
      let status = input.status;
      if (status === "COMPLETED") {
        completed = true;
      } else if (status !== undefined) {
        completed = false;
      } else if (completed !== undefined) {
        status = completed ? "COMPLETED" : "PENDING";
      }

      const updated = await ctx.prisma.task.update({
        where: { id: task.id },
        data: {
          title: input.title,
          description: input.description,
          assignedToId: input.assignedToId,
          leadId: input.leadId,
          dueDate: input.dueDate,
          priority: input.priority,
          status,
          completed,
        },
      });

      const leadId = input.leadId ?? task.leadId;
      if (status === "COMPLETED" && leadId) {
        await logActivity(ctx.prisma, {
          leadId,
          userId: callerId,
          type: "TASK_COMPLETED",
          description: `Task "${updated.title}" completed`,
        });
      }

      return updated;
    }),

  delete: organizationProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.prisma.task.findFirst({
        where: {
          id: input.taskId,
          user: { organizationId: ctx.organizationId },
          deletedAt: null,
        },
        select: { id: true, userId: true },
      });

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      }

      const callerId = ctx.session.user.id;
      const callerRole = ctx.session.user.role;
      if (task.userId !== callerId && !isManagerOrAdmin(callerRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete another user's task." });
      }

      return ctx.prisma.task.update({
        where: { id: task.id },
        data: { deletedAt: new Date() },
      });
    }),

  getAll: organizationProcedure
    .input(
      z
        .object({
          completed: z.boolean().optional(),
          status: statusSchema.optional(),
          priority: prioritySchema.optional(),
          assignedToId: z.string().optional(),
          leadId: z.string().optional(),
          dateFrom: z.coerce.date().optional(),
          dateTo: z.coerce.date().optional(),
          limit: z.number().int().min(1).max(100).default(50),
          cursor: z.string().optional(),
        })
        .optional()
        .default(() => ({ limit: 50 })),
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 50;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = {
        user: { organizationId: ctx.organizationId },
        deletedAt: null,
      };

      if (typeof input.completed === "boolean") where.completed = input.completed;
      if (input.status) where.status = input.status;
      if (input.priority) where.priority = input.priority;
      if (input.assignedToId) where.assignedToId = input.assignedToId;
      if (input.leadId) where.leadId = input.leadId;
      if (input.dateFrom || input.dateTo) {
        where.dueDate = {};
        if (input.dateFrom) where.dueDate.gte = input.dateFrom;
        if (input.dateTo) where.dueDate.lte = input.dateTo;
      }

      const rows = await ctx.prisma.task.findMany({
        where,
        orderBy: [{ completed: "asc" }, { dueDate: "asc" }, { id: "asc" }],
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, company: true } },
          user: { select: { id: true, name: true, image: true } },
          assignedTo: { select: { id: true, name: true, image: true } },
        },
        take: limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | null = null;
      if (rows.length > limit) {
        const next = rows.pop();
        nextCursor = next?.id ?? null;
      }

      return { items: rows, nextCursor };
    }),

  getCalendar: organizationProcedure
    .input(z.object({
      from: z.coerce.date(),
      to: z.coerce.date(),
      assignedToId: z.string().optional(),
    }))
    .query(({ ctx, input }) => {
      return ctx.prisma.task.findMany({
        where: {
          user: { organizationId: ctx.organizationId },
          deletedAt: null,
          dueDate: { gte: input.from, lte: input.to },
          ...(input.assignedToId ? { assignedToId: input.assignedToId } : {}),
        },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, company: true } },
          assignedTo: { select: { id: true, name: true, image: true } },
        },
        orderBy: { dueDate: "asc" },
      });
    }),

  getAllForLead: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { organizationId: true },
      });

      if (!lead || lead.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }

      return ctx.prisma.task.findMany({
        where: { leadId: input.leadId, deletedAt: null },
        orderBy: { dueDate: "asc" },
        include: {
          user: { select: { id: true, name: true, image: true } },
          assignedTo: { select: { id: true, name: true, image: true } },
        },
      });
    }),

  getDueToday: organizationProcedure.query(({ ctx }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    return ctx.prisma.task.findMany({
      where: {
        user: { organizationId: ctx.organizationId },
        dueDate: { gte: today, lt: tomorrow },
        completed: false,
        deletedAt: null,
      },
      take: 5,
      orderBy: { dueDate: "asc" },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, company: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });
  }),

  getOverdue: organizationProcedure.query(({ ctx }) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return ctx.prisma.task.findMany({
      where: {
        user: { organizationId: ctx.organizationId },
        dueDate: { lt: now },
        completed: false,
        deletedAt: null,
      },
      take: 10,
      orderBy: { dueDate: "asc" },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, company: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });
  }),
});
