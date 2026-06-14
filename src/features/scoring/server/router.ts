import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { SCORING_FACTORS } from "../shared";
import { assertManagerOrAdmin } from "@/server/authz";

type DefaultRule = {
  factor: string;
  label: string;
  maxPoints: number;
  weight: number;
  sortOrder: number;
  config?: Record<string, number>;
};

const DEFAULT_RULES: DefaultRule[] = [
  { factor: "star_rating", label: "Star Rating", maxPoints: 40, weight: 1.0, sortOrder: 0 },
  { factor: "review_count", label: "Review Count", maxPoints: 25, weight: 1.0, sortOrder: 1 },
  { factor: "has_website", label: "Has Website", maxPoints: 10, weight: 1.0, sortOrder: 2 },
  {
    factor: "call_activity",
    label: "Call Activity",
    maxPoints: 25,
    weight: 1.0,
    sortOrder: 3,
    config: { ANSWERED: 25, CONNECTED: 25, AI_VOICEMAIL: 10, NOT_CONTACTED: 5, HUNG_UP: -10, NO_ANSWER: 0 },
  },
  {
    factor: "lead_status",
    label: "Lead Status",
    maxPoints: 15,
    weight: 1.0,
    sortOrder: 4,
    config: { CONNECTED: 15, AI_VOICEMAIL: 8, NO_ANSWER: 3, NOT_CONTACTED: 0, HUNG_UP: -5 },
  },
  { factor: "last_contacted", label: "Last Contacted", maxPoints: 10, weight: 1.0, sortOrder: 5 },
];

function toJsonInput(config: Record<string, number> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!config) return Prisma.JsonNull;
  return config as Prisma.InputJsonValue;
}

function buildCreateData(r: DefaultRule, organizationId: string): Prisma.ScoringRuleCreateManyInput {
  return {
    factor: r.factor,
    label: r.label,
    maxPoints: r.maxPoints,
    weight: r.weight,
    sortOrder: r.sortOrder,
    organizationId,
    config: r.config ? (r.config as Prisma.InputJsonValue) : Prisma.JsonNull,
  };
}

export const scoringRouter = createTRPCRouter({
  getRules: organizationProcedure.query(async ({ ctx }) => {
    const existing = await ctx.prisma.scoringRule.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { sortOrder: "asc" },
    });

    if (existing.length > 0) return existing;

    // Seed defaults on first access
    await ctx.prisma.scoringRule.createMany({
      data: DEFAULT_RULES.map((r) => buildCreateData(r, ctx.organizationId)),
    });

    return ctx.prisma.scoringRule.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { sortOrder: "asc" },
    });
  }),

  upsertRule: organizationProcedure
    .input(
      z.object({
        id: z.string().optional(),
        factor: z.enum(SCORING_FACTORS),
        label: z.string().min(1).max(100),
        maxPoints: z.number().min(0).max(200),
        weight: z.number().min(0).max(5),
        config: z.record(z.string(), z.number()).optional().nullable(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertManagerOrAdmin(ctx.session.user.role);
      const { id, ...data } = input;
      const configJson = toJsonInput(data.config);

      if (id) {
        // Verify ownership before update (id is the unique key)
        const existing = await ctx.prisma.scoringRule.findFirst({
          where: { id, organizationId: ctx.organizationId },
          select: { id: true },
        });
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

        return ctx.prisma.scoringRule.update({
          where: { id },
          data: {
            factor: data.factor,
            label: data.label,
            maxPoints: data.maxPoints,
            weight: data.weight,
            config: configJson,
            isActive: data.isActive ?? true,
            ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          },
        });
      }

      const count = await ctx.prisma.scoringRule.count({
        where: { organizationId: ctx.organizationId },
      });

      return ctx.prisma.scoringRule.create({
        data: {
          organizationId: ctx.organizationId,
          factor: data.factor,
          label: data.label,
          maxPoints: data.maxPoints,
          weight: data.weight,
          config: configJson,
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? count,
        },
      });
    }),

  deleteRule: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertManagerOrAdmin(ctx.session.user.role);
      const existing = await ctx.prisma.scoringRule.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.scoringRule.delete({ where: { id: input.id } });
    }),

  resetToDefaults: organizationProcedure.mutation(async ({ ctx }) => {
    assertManagerOrAdmin(ctx.session.user.role);
    await ctx.prisma.scoringRule.deleteMany({
      where: { organizationId: ctx.organizationId },
    });
    await ctx.prisma.scoringRule.createMany({
      data: DEFAULT_RULES.map((r) => buildCreateData(r, ctx.organizationId)),
    });
    return ctx.prisma.scoringRule.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { sortOrder: "asc" },
    });
  }),
});
