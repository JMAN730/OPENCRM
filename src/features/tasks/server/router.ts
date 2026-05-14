import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { isManagerOrAdmin } from "@/server/authz";

export const tasksRouter = createTRPCRouter({
  create: organizationProcedure
    .input(z.object({
      leadId: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      dueDate: z.coerce.date().optional(),
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

      return ctx.prisma.task.create({
        data: {
          leadId: input.leadId,
          userId: ctx.session.user.id,
          title: input.title,
          description: input.description,
          dueDate: input.dueDate,
        },
      });
    }),

  update: organizationProcedure
    .input(z.object({
      taskId: z.string(),
      completed: z.boolean().optional(),
      title: z.string().min(1).optional(),
      dueDate: z.coerce.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Org-scoped lookup: the task must belong to a user inside the
      // caller's organization. This is the multi-tenant gate.
      const task = await ctx.prisma.task.findFirst({
        where: {
          id: input.taskId,
          user: { organizationId: ctx.organizationId },
        },
        select: { id: true, userId: true },
      });

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      }

      // Within the org, only the task owner can edit it unless the caller
      // is a manager/admin (who can manage their team's tasks).
      const callerId = ctx.session.user.id;
      const callerRole = ctx.session.user.role;
      if (task.userId !== callerId && !isManagerOrAdmin(callerRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot edit another user's task." });
      }

      return ctx.prisma.task.update({
        where: { id: task.id },
        data: {
          completed: input.completed,
          title: input.title,
          dueDate: input.dueDate,
        },
      });
    }),

  delete: organizationProcedure
    .input(z.object({
      taskId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.prisma.task.findFirst({
        where: {
          id: input.taskId,
          user: { organizationId: ctx.organizationId },
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

      return ctx.prisma.task.delete({
        where: { id: task.id },
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
        where: { leadId: input.leadId },
        orderBy: { dueDate: "asc" },
        include: { user: { select: { name: true, image: true } } },
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
      },
      take: 5,
      orderBy: { dueDate: "asc" },
      include: { lead: { select: { firstName: true, lastName: true, company: true } } },
    });
  }),

  getAll: organizationProcedure
    .input(
      z
        .object({
          completed: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).default(50),
          cursor: z.string().optional(),
        })
        .optional()
        .default(() => ({ limit: 50 })),
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 50;
      const where: Record<string, unknown> = {
        user: { organizationId: ctx.organizationId },
      };
      if (typeof input.completed === "boolean") {
        where.completed = input.completed;
      }
      const rows = await ctx.prisma.task.findMany({
        where,
        // Primary order is "incomplete first, then by due date". `id` is the
        // tie-breaker so Prisma's cursor pagination is deterministic; without
        // it pages can skip or repeat rows.
        orderBy: [{ completed: "asc" }, { dueDate: "asc" }, { id: "asc" }],
        include: {
          lead: { select: { firstName: true, lastName: true, company: true } },
          user: { select: { name: true, image: true } },
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
});
