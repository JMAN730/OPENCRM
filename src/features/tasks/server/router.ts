import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const tasksRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({
      leadId: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      dueDate: z.string().optional(), // ISO string from client
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const organizationId = ctx.session.user.organizationId;

      if (input.leadId) {
        const lead = await ctx.prisma.lead.findUnique({
          where: { id: input.leadId },
          select: { organizationId: true },
        });
        if (!lead || lead.organizationId !== organizationId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
        }
      }

      return ctx.prisma.task.create({
        data: {
          leadId: input.leadId,
          userId,
          title: input.title,
          description: input.description,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        },
      });
    }),

  update: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      completed: z.boolean().optional(),
      title: z.string().min(1).optional(),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const task = await ctx.prisma.task.findUnique({
        where: { id: input.taskId },
        select: { userId: true },
      });

      if (!task || task.userId !== userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      }

      return ctx.prisma.task.update({
        where: { id: input.taskId },
        data: {
          completed: input.completed,
          title: input.title,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        },
      });
    }),

  getAllForLead: protectedProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const organizationId = ctx.session.user.organizationId;

      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { organizationId: true },
      });

      if (!lead || lead.organizationId !== organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }

      return ctx.prisma.task.findMany({
        where: { leadId: input.leadId },
        orderBy: { dueDate: "asc" },
        include: { user: { select: { name: true, image: true } } },
      });
    }),

  getDueToday: protectedProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.session.user.organizationId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    return ctx.prisma.task.findMany({
      where: {
        user: { organizationId },
        dueDate: { gte: today, lt: tomorrow },
        completed: false,
      },
      take: 5,
      orderBy: { dueDate: "asc" },
      include: { lead: { select: { firstName: true, lastName: true, company: true } } },
    });
  }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.session.user.organizationId;

    return ctx.prisma.task.findMany({
      where: {
        user: { organizationId },
      },
      orderBy: [
        { completed: "asc" },
        { dueDate: "asc" },
      ],
      include: {
        lead: { select: { firstName: true, lastName: true, company: true } },
        user: { select: { name: true, image: true } },
      },
    });
  }),
});
