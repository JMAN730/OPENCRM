import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { isManagerOrAdmin } from "@/server/authz";

const scheduleInput = z.object({
  locations: z.array(z.string().min(1)).min(1).max(50),
  categories: z.array(z.string()).default([]),
  limit: z.number().int().min(1).max(200).default(20),
  concurrency: z.number().int().min(1).max(4).default(1),
  dayOfWeek: z.number().int().min(0).max(6),
  hourOfDay: z.number().int().min(0).max(23),
  autoImport: z.boolean().default(true),
  autoOutreach: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

const updateInput = z.object({
  id: z.string(),
  locations: z.array(z.string().min(1)).min(1).max(50).optional(),
  categories: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  concurrency: z.number().int().min(1).max(4).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  hourOfDay: z.number().int().min(0).max(23).optional(),
  autoImport: z.boolean().optional(),
  autoOutreach: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

type ScheduleRow = {
  id: string;
  organizationId: string;
  locations: string[];
  categories: string[];
  limit: number;
  concurrency: number;
  dayOfWeek: number;
  hourOfDay: number;
  autoImport: boolean;
  autoOutreach: boolean;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRow(raw: {
  id: string;
  organizationId: string;
  locations: unknown;
  categories: unknown;
  limit: number;
  concurrency: number;
  dayOfWeek: number;
  hourOfDay: number;
  autoImport: boolean;
  autoOutreach: boolean;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ScheduleRow {
  return {
    ...raw,
    locations: Array.isArray(raw.locations) ? (raw.locations as string[]) : [],
    categories: Array.isArray(raw.categories) ? (raw.categories as string[]) : [],
  };
}

export const scheduledScraperRouter = createTRPCRouter({
  list: organizationProcedure.query(async ({ ctx }): Promise<ScheduleRow[]> => {
    const rows = await ctx.prisma.scheduledScrape.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toRow);
  }),

  create: organizationProcedure
    .input(scheduleInput)
    .mutation(async ({ ctx, input }): Promise<ScheduleRow> => {
      if (!isManagerOrAdmin((ctx.session.user as { role?: string }).role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only managers and admins can create schedules." });
      }
      const count = await ctx.prisma.scheduledScrape.count({
        where: { organizationId: ctx.organizationId },
      });
      if (count >= 10) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 10 scheduled scrapes per organization." });
      }

      const next = nextRunDate(input.dayOfWeek, input.hourOfDay);
      const created = await ctx.prisma.scheduledScrape.create({
        data: {
          organizationId: ctx.organizationId,
          locations: input.locations,
          categories: input.categories,
          limit: input.limit,
          concurrency: input.concurrency,
          dayOfWeek: input.dayOfWeek,
          hourOfDay: input.hourOfDay,
          autoImport: input.autoImport,
          autoOutreach: input.autoImport && input.autoOutreach,
          enabled: input.enabled,
          nextRunAt: next,
        },
      });
      return toRow(created);
    }),

  update: organizationProcedure
    .input(updateInput)
    .mutation(async ({ ctx, input }): Promise<ScheduleRow> => {
      if (!isManagerOrAdmin((ctx.session.user as { role?: string }).role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const existing = await ctx.prisma.scheduledScrape.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const { id, dayOfWeek, hourOfDay, ...rest } = input;
      const nextRunAt =
        dayOfWeek !== undefined || hourOfDay !== undefined
          ? nextRunDate(dayOfWeek ?? existing.dayOfWeek, hourOfDay ?? existing.hourOfDay)
          : undefined;

      const updated = await ctx.prisma.scheduledScrape.update({
        where: { id },
        data: { ...rest, dayOfWeek, hourOfDay, ...(nextRunAt ? { nextRunAt } : {}) },
      });
      return toRow(updated);
    }),

  delete: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: boolean }> => {
      if (!isManagerOrAdmin((ctx.session.user as { role?: string }).role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const existing = await ctx.prisma.scheduledScrape.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.prisma.scheduledScrape.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});

function nextRunDate(dayOfWeek: number, hourOfDay: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hourOfDay, 0, 0, 0);
  const daysUntil = (dayOfWeek - now.getUTCDay() + 7) % 7;
  next.setUTCDate(now.getUTCDate() + (daysUntil === 0 && next <= now ? 7 : daysUntil));
  return next;
}
