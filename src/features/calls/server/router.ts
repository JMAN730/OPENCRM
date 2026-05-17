import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logActivity } from "@/server/activity";

export const callsRouter = createTRPCRouter({
  logCall: organizationProcedure
    .input(z.object({
      leadId: z.string(),
      status: z.enum(["BUSY", "NO_ANSWER", "CONNECTED", "FAILED", "CANCELED"]),
      duration: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { organizationId: true },
      });

      if (!lead || lead.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }

      const call = await ctx.prisma.callLog.create({
        data: {
          leadId: input.leadId,
          userId: ctx.session.user.id,
          status: input.status,
          duration: input.duration,
        },
      });
      await logActivity(ctx.prisma, {
        leadId: input.leadId,
        userId: ctx.session.user.id,
        type: "CALL_LOGGED",
        description: `Logged call (${input.status.toLowerCase()}${
          input.duration ? `, ${input.duration}s` : ""
        })`,
      });
      return call;
    }),

  getForLead: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { organizationId: true },
      });

      if (!lead || lead.organizationId !== ctx.organizationId) {
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

  getRecent: organizationProcedure.query(({ ctx }) => {
    return ctx.prisma.callLog.findMany({
      where: { lead: { organizationId: ctx.organizationId } },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        lead: { select: { firstName: true, lastName: true } },
        user: { select: { name: true, image: true } },
      },
    });
  }),
});
