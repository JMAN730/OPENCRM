import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateWebsiteForLead } from "@/features/websites/server/service";
import { assertWithinRateLimit } from "@/lib/rateLimit";
import { requireVisibleLead, visibleLeadWhere } from "@/server/lead-visibility";
import { keys } from "@/lib/cacheKeys";

export const websitesRouter = createTRPCRouter({
  getForLead: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.generatedWebsite.findFirst({
        where: { leadId: input.leadId, lead: await visibleLeadWhere(ctx) },
        orderBy: { createdAt: "desc" },
      });
    }),

  generateAi: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertWithinRateLimit({
        key: keys.demoGenBucket(ctx.organizationId, input.leadId),
        limit: 5,
        windowSeconds: 60,
      });

      const lead = await requireVisibleLead(ctx, input.leadId);

      const { website, needsPhotos } = await generateWebsiteForLead(ctx.prisma, lead, {
        organizationId: ctx.organizationId,
        userId: ctx.session.user.id,
      }).catch((err: unknown) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Failed to generate demo content.",
        });
      });

      return { ...website, needsPhotos };
    }),

  delete: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.generatedWebsite.findFirst({
        where: { id: input.id, lead: await visibleLeadWhere(ctx) },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.generatedWebsite.delete({ where: { id: input.id } });
    }),
});
