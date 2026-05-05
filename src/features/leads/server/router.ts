import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
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
  getAll: organizationProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(({ ctx, input }) => {
      return ctx.prisma.lead.findMany({
        where: {
          organizationId: ctx.organizationId,
          OR: input.search ? [
            { company: { contains: input.search } },
            { firstName: { contains: input.search } },
            { lastName: { contains: input.search } },
            { email: { contains: input.search } },
            { phone: { contains: input.search } },
          ] : undefined,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: organizationProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return lead;
    }),

  delete: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return ctx.prisma.lead.delete({ where: { id: input.id } });
    }),

  create: organizationProcedure
    .input(leadInputSchema)
    .mutation(({ ctx, input }) => {
      return ctx.prisma.lead.create({
        data: {
          ...input,
          organizationId: ctx.organizationId,
          assignedToId: ctx.session.user.id,
        },
      });
    }),

  bulkCreate: organizationProcedure
    .input(z.array(leadInputSchema).min(1).max(5000))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.lead.createMany({
        data: input.map((lead) => ({
          ...lead,
          organizationId: ctx.organizationId,
          assignedToId: ctx.session.user.id,
        })),
      });
      return { count: result.count };
    }),
});
