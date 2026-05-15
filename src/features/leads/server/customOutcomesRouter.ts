import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const customOutcomesRouter = createTRPCRouter({
  list: organizationProcedure.query(async ({ ctx }) => {
    return ctx.prisma.customOutcome.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, label: true, hint: true },
      orderBy: { createdAt: "asc" },
    });
  }),

  create: organizationProcedure
    .input(
      z.object({
        label: z.string().min(1).max(80),
        hint: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.customOutcome.findFirst({
        where: { organizationId: ctx.organizationId, label: input.label },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `An outcome named "${input.label}" already exists.`,
        });
      }
      return ctx.prisma.customOutcome.create({
        data: {
          label: input.label,
          hint: input.hint,
          organizationId: ctx.organizationId,
        },
      });
    }),

  delete: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.prisma.customOutcome.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!record) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Custom outcome not found." });
      }
      await ctx.prisma.lead.updateMany({
        where: { customOutcomeId: input.id },
        data: { callOutcome: "NOT_CONTACTED", status: "NOT_CONTACTED", customOutcomeId: null },
      });
      await ctx.prisma.customOutcome.delete({ where: { id: input.id } });
    }),
});
