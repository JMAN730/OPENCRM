import { createTRPCRouter, organizationProcedure } from '@/server/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@prisma/client';
import { logActivity } from '@/server/activity';
import { getLeadScope, leadWhereFromScope } from '@/server/teams/scope';

const DEFAULT_STAGES = [
  { name: 'Potential',   order: 0 },
  { name: 'Qualified',   order: 1 },
  { name: 'Proposal',    order: 2 },
  { name: 'Negotiation', order: 3 },
  { name: 'Won',         order: 4 },
  { name: 'Lost',        order: 5 },
];

const DEFAULT_STAGE_NAMES = new Set(DEFAULT_STAGES.map((s) => s.name.toLowerCase()));

function isDefaultStageName(name: string) {
  return DEFAULT_STAGE_NAMES.has(name.trim().toLowerCase());
}

async function getOrCreateDefaultPipeline(prisma: PrismaClient, organizationId: string) {
  let pipeline = await prisma.pipeline.findFirst({
    where: { organizationId },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: { name: 'Sales', organizationId, stages: { create: DEFAULT_STAGES } },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    return pipeline;
  }
  if (
    pipeline.stages.some((s) => s.name === 'New') &&
    !pipeline.stages.some((s) => s.name === 'Potential')
  ) {
    await prisma.pipelineStage.updateMany({
      where: { pipelineId: pipeline.id, name: 'New' },
      data: { name: 'Potential' },
    });
    pipeline = await prisma.pipeline.findUnique({
      where: { id: pipeline.id },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!pipeline) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Pipeline not found after stage rename' });
  }
  const existingNames = new Set(pipeline.stages.map((s) => s.name));
  const missing = DEFAULT_STAGES.filter((s) => !existingNames.has(s.name));
  if (missing.length > 0) {
    await prisma.pipelineStage.createMany({
      data: missing.map((s) => ({ ...s, pipelineId: pipeline!.id })),
    });
    pipeline = await prisma.pipeline.findUnique({
      where: { id: pipeline.id },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  }
  return pipeline!;
}

const LEAD_SELECT = {
  id: true, company: true, firstName: true, lastName: true,
  city: true, state: true, value: true, starred: true,
  temperatureOverride: true, source: true, rating: true,
  createdAt: true, updatedAt: true,
  assignedTo: { select: { id: true, name: true } },
} as const;

export const pipelineRouter = createTRPCRouter({
  getBoard: organizationProcedure.query(async ({ ctx }) => {
    const pipeline = await getOrCreateDefaultPipeline(ctx.prisma as unknown as PrismaClient, ctx.organizationId);
    // Scope the nested leads to what the caller is allowed to see (mirrors
    // moveLead and the rest of the pipeline mutations). leadWhereFromScope
    // already constrains by organizationId, so a USER/team-leader no longer
    // sees every org lead's names, companies, deal values, and assignees.
    const scope = await getLeadScope(ctx, ctx.session.user.id, ctx.session.user.role);
    const stages = await ctx.prisma.pipelineStage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { order: 'asc' },
      include: {
        leads: {
          where: leadWhereFromScope(scope),
          select: LEAD_SELECT,
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    return { pipeline, stages };
  }),

  moveLead: organizationProcedure
    .input(z.object({ leadId: z.string(), stageId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.stageId) {
        const pipeline = await getOrCreateDefaultPipeline(ctx.prisma as unknown as PrismaClient, ctx.organizationId);
        const stage = await ctx.prisma.pipelineStage.findFirst({
          where: { id: input.stageId },
          include: { pipeline: true },
        });
        // Stage must be org-owned AND belong to the active pipeline — otherwise a
        // stage from another of the org's pipelines could corrupt the board.
        if (!stage || stage.pipeline.organizationId !== ctx.organizationId || stage.pipelineId !== pipeline.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Stage not found' });
        }
      }

      const scope = await getLeadScope(ctx, ctx.session.user.id, ctx.session.user.role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: 'FORBIDDEN', message: 'Lead not found' });

      return ctx.prisma.lead.update({
        where: { id: lead.id },
        data: { pipelineStageId: input.stageId },
      });
    }),

  renameStage: organizationProcedure
    .input(z.object({ stageId: z.string().min(1), name: z.string().trim().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const stage = await ctx.prisma.pipelineStage.findFirst({
        where: { id: input.stageId },
        include: { pipeline: true },
      });
      if (!stage || stage.pipeline.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Stage not found' });
      }
      return ctx.prisma.pipelineStage.update({
        where: { id: stage.id },
        data: { name: input.name },
      });
    }),

  deleteStage: organizationProcedure
    .input(z.object({ stageId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const stage = await ctx.prisma.pipelineStage.findFirst({
        where: { id: input.stageId },
        include: { pipeline: true, _count: { select: { leads: true } } },
      });
      if (!stage || stage.pipeline.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Stage not found' });
      }
      if (isDefaultStageName(stage.name)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Default stages cannot be deleted' });
      }
      if (stage._count.leads > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Move deals out of this stage before deleting',
        });
      }
      await ctx.prisma.pipelineStage.delete({ where: { id: stage.id } });
      return { ok: true };
    }),

  duplicateStage: organizationProcedure
    .input(z.object({ stageId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.prisma.pipelineStage.findFirst({
        where: { id: input.stageId },
        include: { pipeline: true },
      });
      if (!source || source.pipeline.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Stage not found' });
      }
      const created = await ctx.prisma.$transaction(async (tx) => {
        await tx.pipelineStage.updateMany({
          where: { pipelineId: source.pipelineId, order: { gt: source.order } },
          data: { order: { increment: 1 } },
        });
        return tx.pipelineStage.create({
          data: {
            name: `${source.name} (Copy)`,
            order: source.order + 1,
            pipelineId: source.pipelineId,
          },
        });
      });
      return created;
    }),

  updateDealValue: organizationProcedure
    .input(z.object({ leadId: z.string(), value: z.number().nonnegative().max(1_000_000_000).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const scope = await getLeadScope(ctx, ctx.session.user.id, ctx.session.user.role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });
      return ctx.prisma.lead.update({
        where: { id: lead.id },
        data: { value: input.value },
        select: LEAD_SELECT,
      });
    }),

  createDeal: organizationProcedure
    .input(
      z.union([
        z.object({
          leadId: z.string(),
          value: z.number().nonnegative().max(99999).nullable().optional(),
          stageId: z.string().nullable().optional(),
        }),
        z.object({
          company: z.string().trim().min(1, 'Company is required').max(200),
          value: z.number().nonnegative().max(99999).nullable().optional(),
          stageId: z.string().nullable().optional(),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      let stageId: string | null = null;
      let stageName: string | null = null;
      if (input.stageId) {
        const pipeline = await getOrCreateDefaultPipeline(ctx.prisma as unknown as PrismaClient, ctx.organizationId);
        const stage = await ctx.prisma.pipelineStage.findFirst({
          where: { id: input.stageId },
          include: { pipeline: true },
        });
        // Stage must be org-owned AND belong to the active pipeline.
        if (!stage || stage.pipeline.organizationId !== ctx.organizationId || stage.pipelineId !== pipeline.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Stage not found' });
        }
        stageId = stage.id;
        stageName = stage.name;
      }

      if ('leadId' in input) {
        const scope = await getLeadScope(ctx, ctx.session.user.id, ctx.session.user.role);
        const existing = await ctx.prisma.lead.findFirst({
          where: { id: input.leadId, ...leadWhereFromScope(scope) },
        });
        if (!existing) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Lead not found' });
        }

        const lead = await ctx.prisma.lead.update({
          where: { id: existing.id },
          data: {
            pipelineStageId: stageId,
            ...(input.value !== undefined ? { value: input.value } : {}),
          },
        });

        await logActivity(ctx.prisma, {
          leadId: lead.id,
          userId: ctx.session.user.id,
          type: 'LEAD_ASSIGNED',
          description: stageName
            ? `Moved ${lead.company ?? '(unnamed)'} to ${stageName}`
            : `Added ${lead.company ?? '(unnamed)'} to pipeline`,
        });

        return lead;
      }

      const lead = await ctx.prisma.lead.create({
        data: {
          company: input.company,
          value: input.value ?? null,
          organizationId: ctx.organizationId,
          assignedToId: ctx.session.user.id,
          pipelineStageId: stageId,
        },
      });

      await logActivity(ctx.prisma, {
        leadId: lead.id,
        userId: ctx.session.user.id,
        type: 'LEAD_CREATED',
        description: `Created deal ${lead.company ?? '(unnamed)'}`,
      });

      return lead;
    }),
});
