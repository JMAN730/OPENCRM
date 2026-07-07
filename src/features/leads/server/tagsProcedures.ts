import { organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { scopedLeadWhere } from "@/server/teams/scope";
import {
  assertTagLimit,
  getOrgSubscription,
} from "@/features/billing/server/enforcement";
import { getPlanLimits } from "@/features/billing/server/plans";

/**
 * Tag sub-resource of the leads router. Spread into leadsRouter so the
 * client procedure names stay flat (trpc.leads.createTag etc.).
 */
export const leadTagsProcedures = {
  listOrgTags: organizationProcedure.query(({ ctx }) =>
    ctx.prisma.leadTag.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ),

  createTag: organizationProcedure
    .input(z.object({ name: z.string().trim().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.leadTag.count({
        where: { organizationId: ctx.organizationId },
      });
      const sub = await getOrgSubscription(ctx.prisma, ctx.organizationId);
      if (sub) {
        assertTagLimit(sub, existing);
      } else if (existing >= getPlanLimits("STARTER").maxTags) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum ${getPlanLimits("STARTER").maxTags} tags per organization.`,
        });
      }
      const name = input.name.trim();
      const tagKey = name.toLocaleLowerCase();
      return ctx.prisma.leadTag.upsert({
        where: { organizationId_tagKey: { organizationId: ctx.organizationId, tagKey } },
        create: { name, tagKey, organizationId: ctx.organizationId },
        update: {},
        select: { id: true, name: true },
      });
    }),

  deleteTag: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.prisma.leadTag.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found." });
      await ctx.prisma.leadTag.delete({ where: { id: tag.id } });
      return { ok: true };
    }),

  addTagToLead: organizationProcedure
    .input(z.object({ leadId: z.string(), tagId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const scopedWhere = await scopedLeadWhere(ctx);
      const [lead, tag] = await Promise.all([
        ctx.prisma.lead.findFirst({
          where: { id: input.leadId, ...scopedWhere },
          select: { id: true },
        }),
        ctx.prisma.leadTag.findFirst({
          where: { id: input.tagId, organizationId: ctx.organizationId },
          select: { id: true },
        }),
      ]);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found." });

      await ctx.prisma.lead.update({
        where: { id: lead.id },
        data: { tags: { connect: { id: tag.id } } },
      });
      return { ok: true };
    }),

  removeTagFromLead: organizationProcedure
    .input(z.object({ leadId: z.string(), tagId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...(await scopedLeadWhere(ctx)) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });

      await ctx.prisma.lead.update({
        where: { id: lead.id },
        data: { tags: { disconnect: { id: input.tagId } } },
      });
      return { ok: true };
    }),

  bulkAddTag: organizationProcedure
    .input(z.object({ leadIds: z.array(z.string()).min(1).max(500), tagId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const uniqueIds = [...new Set(input.leadIds)];

      const tag = await ctx.prisma.leadTag.findFirst({
        where: { id: input.tagId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found." });

      const leads = await ctx.prisma.lead.findMany({
        where: { id: { in: uniqueIds }, ...(await scopedLeadWhere(ctx)) },
        select: { id: true },
      });
      if (leads.length !== uniqueIds.length) {
        throw new TRPCError({ code: "FORBIDDEN", message: "One or more leads are outside your scope." });
      }

      await ctx.prisma.leadTag.update({
        where: { id: tag.id },
        data: { leads: { connect: uniqueIds.map((id) => ({ id })) } },
      });

      return { count: uniqueIds.length };
    }),

  getLeadTags: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...(await scopedLeadWhere(ctx)) },
        select: { tags: { select: { id: true, name: true } } },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      return lead.tags;
    }),
};
