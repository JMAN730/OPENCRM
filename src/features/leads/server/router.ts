import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

const leadInputSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  website: z.string().optional(),
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "LOST", "WON"]).default("NEW"),
  source: z.string().optional(),
});

export const leadsRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(({ ctx, input }) => {
      const organizationId = ctx.session.user.organizationId ?? undefined;
      return ctx.prisma.lead.findMany({
        where: {
          organizationId,
          OR: input?.search ? [
            { company: { contains: input.search } },
            { firstName: { contains: input.search } },
            { lastName: { contains: input.search } },
            { email: { contains: input.search } },
            { phone: { contains: input.search } },
          ] : undefined,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const organizationId = ctx.session.user.organizationId ?? undefined;
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, organizationId },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return lead;
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = ctx.session.user.organizationId ?? undefined;
      // Ensure the lead belongs to the user's organization
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, organizationId },
      });
      if (!lead) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }
      return ctx.prisma.lead.delete({
        where: { id: input.id },
      });
    }),
  create: protectedProcedure
    .input(leadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = ctx.session.user.organizationId;
      if (!organizationId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User has no organization." });
      }
      return ctx.prisma.lead.create({
        data: {
          ...input,
          organizationId,
          assignedToId: ctx.session.user.id,
        },
      });
    }),

  bulkCreate: protectedProcedure
    .input(z.array(leadInputSchema).min(1).max(5000))
    .mutation(async ({ ctx, input }) => {
      const organizationId = ctx.session.user.organizationId;
      const assignedToId = ctx.session.user.id;
      if (!organizationId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User has no organization." });
      }
      const result = await ctx.prisma.lead.createMany({
        data: input.map((lead) => ({
          ...lead,
          organizationId,
          assignedToId,
        })),
      });
      return { count: result.count };
    }),
});
