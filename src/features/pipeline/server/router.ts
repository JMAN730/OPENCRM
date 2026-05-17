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
    const stages = await ctx.prisma.pipelineStage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { order: 'asc' },
      include: {
        leads: {
          where: { organizationId: ctx.organizationId },
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
        const stage = await ctx.prisma.pipelineStage.findFirst({
          where: { id: input.stageId },
          include: { pipeline: true },
        });
        if (!stage || stage.pipeline.organizationId !== ctx.organizationId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Stage not found' });
        }
      }
      return ctx.prisma.lead.update({
        where: { id: input.leadId, organizationId: ctx.organizationId },
        data: { pipelineStageId: input.stageId },
      });
    }),

  createDeal: organizationProcedure
    .input(
      z.union([
        z.object({
          leadId: z.string(),
          value: z.number().nonnegative().nullable().optional(),
          stageId: z.string().nullable().optional(),
        }),
        z.object({
          company: z.string().trim().min(1, 'Company is required').max(200),
          value: z.number().nonnegative().nullable().optional(),
          stageId: z.string().nullable().optional(),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      let stageId: string | null = null;
      let stageName: string | null = null;
      if (input.stageId) {
        const stage = await ctx.prisma.pipelineStage.findFirst({
          where: { id: input.stageId },
          include: { pipeline: true },
        });
        if (!stage || stage.pipeline.organizationId !== ctx.organizationId) {
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
