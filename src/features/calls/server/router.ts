import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const callsRouter = createTRPCRouter({
  logCall: protectedProcedure
    .input(z.object({
      leadId: z.string(),
      status: z.enum(["BUSY", "NO_ANSWER", "CONNECTED", "FAILED", "CANCELED"]),
      duration: z.number().int().positive().optional(),
      disposition: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = (ctx.session.user as any).id;
      const organizationId = (ctx.session.user as any).organizationId;

      if (!organizationId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User organization not found." });
      }

      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { organizationId: true },
      });

      if (!lead || lead.organizationId !== organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }

      return ctx.prisma.callLog.create({
        data: {
          leadId: input.leadId,
          userId,
          status: input.status,
          duration: input.duration,
          disposition: input.disposition,
        },
      });
    }),

  getForLead: protectedProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const organizationId = (ctx.session.user as any).organizationId;

      if (!organizationId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User organization not found." });
      }

      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { organizationId: true },
      });

      if (!lead || lead.organizationId !== organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }

      return ctx.prisma.callLog.findMany({
        where: { leadId: input.leadId },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, image: true } },
        },
      });
    }),

  getRecent: protectedProcedure.query(async ({ ctx }) => {
    const organizationId = (ctx.session.user as any).organizationId;

    if (!organizationId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User organization not found." });
    }

    return ctx.prisma.callLog.findMany({
      where: {
        lead: { organizationId },
      },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        lead: { select: { firstName: true, lastName: true } },
        user: { select: { name: true, image: true } },
      },
    });
  }),
});
