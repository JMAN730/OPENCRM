import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { sanitizeLocations } from "@/server/scraper/sanitize";
import {
  scraperConfig,
  SCRAPER_CATEGORIES,
} from "@/server/scraper/config";
import {
  startScraperJob,
  stopScraperJob,
  isJobRunning,
  deleteScraperOutput,
} from "@/server/scraper/runner";
import {
  applyFilter,
  importRowsToLeads,
  readScrapedCsv,
} from "@/server/scraper/importer";

function parseArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((item): item is string => typeof item === "string");
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}
function deserializeJob<T extends { locations: unknown; categories: unknown }>(
  job: T
): Omit<T, "locations" | "categories"> & { locations: string[]; categories: string[] } {
  // Preserve the full job shape (status, ids, timestamps, etc.) while converting
  // the JSON-string array fields into string[] for the client.
  return {
    ...(job as Omit<T, "locations" | "categories">),
    locations: parseArray(job.locations),
    categories: parseArray(job.categories),
  };
}


const startInput = z.object({
  locations: z
    .array(z.string())
    .min(1, "At least one location required")
    .max(scraperConfig.maxLocations, `Max ${scraperConfig.maxLocations} locations per job`),
  limit: z.number().int().min(1).max(scraperConfig.maxLimit).default(20),
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(scraperConfig.maxConcurrency)
    .default(1),
  categories: z.array(z.string()).optional(),
  autoImport: z.boolean().default(true),
});

export const scraperRouter = createTRPCRouter({
  config: organizationProcedure.query(() => ({
    enabled: scraperConfig.enabled,
    categories: SCRAPER_CATEGORIES,
    maxLocations: scraperConfig.maxLocations,
    maxLimit: scraperConfig.maxLimit,
    maxConcurrency: scraperConfig.maxConcurrency,
  })),

  list: organizationProcedure.query(async ({ ctx }) => {
    const jobs = await ctx.prisma.scraperJob.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        locations: true,
        categories: true,
        limit: true,
        concurrency: true,
        totalScraped: true,
        importedCount: true,
        autoImport: true,
        totalQueries: true,
        completedQueries: true,
        failedQueries: true,
        lastHeartbeatAt: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        error: true,
      },
    });
    return jobs.map(deserializeJob);
  }),

  getById: organizationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.prisma.scraperJob.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
      });
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });

      // Be explicit about the shape returned to the client so callers can rely on
      // fields like `status`, even if Prisma typings are unavailable in some build contexts.
      return {
        id: job.id,
        status: job.status,
        locations: parseArray(job.locations),
        categories: parseArray(job.categories),
        limit: job.limit,
        concurrency: job.concurrency,
        totalScraped: job.totalScraped,
        importedCount: job.importedCount,
        totalQueries: job.totalQueries,
        completedQueries: job.completedQueries,
        failedQueries: job.failedQueries,
        lastHeartbeatAt: job.lastHeartbeatAt,
        logs: job.logs,
        error: job.error,
        completedAt: job.completedAt,
        isRunning: isJobRunning(job.id),
      };
    }),

  start: organizationProcedure
    .input(startInput)
    .mutation(async ({ ctx, input }) => {
      if (!scraperConfig.enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Scraper feature is disabled.",
        });
      }
      const { organizationId, session: { user: { id: userId } } } = ctx;

      let cleanLocations: string[];
      try {
        cleanLocations = sanitizeLocations(input.locations);
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "Invalid locations",
        });
      }

      const validCategories =
        input.categories?.filter((c) =>
          (SCRAPER_CATEGORIES as readonly string[]).includes(c)
        ) ?? [];

      const job = await ctx.prisma.scraperJob.create({
        data: {
          organizationId,
          userId,
          locations: cleanLocations,
          categories: validCategories,
          limit: input.limit,
          concurrency: input.concurrency,
          autoImport: input.autoImport,
          status: "PENDING",
        },
      });

      try {
        await startScraperJob(job.id);
      } catch (e) {
        await ctx.prisma.scraperJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: e instanceof Error ? e.message : String(e),
            completedAt: new Date(),
          },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : "Failed to start scraper",
        });
      }

      return { id: job.id };
    }),

  stop: organizationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.scraperJob.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        select: { id: true, status: true, outputDir: true },
      });
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.status !== "RUNNING") {
        return { ok: true, message: "Job is not running." };
      }
      await stopScraperJob(job.id);
      return { ok: true };
    }),

  delete: organizationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.scraperJob.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        select: { id: true, status: true, outputDir: true },
      });
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.status === "RUNNING") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Stop the job before deleting it.",
        });
      }
      await deleteScraperOutput(job.id, job.outputDir);
      await ctx.prisma.scraperJob.delete({ where: { id: job.id } });
      return { ok: true };
    }),

  // Manually re-import (or filter-import) the CSV produced by a finished job
  importResults: organizationProcedure
    .input(
      z.object({
        id: z.string().min(1),
        filter: z
          .object({
            categories: z.array(z.string()).optional(),
            locations: z.array(z.string()).optional(),
            excludeMissingPhone: z.boolean().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.scraperJob.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
      });
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (!job.outputDir) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Job has no output directory.",
        });
      }
      const rows = await readScrapedCsv(job.outputDir);
      const filtered = applyFilter(rows, input.filter);
      const result = await importRowsToLeads({
        rows: filtered,
        organizationId: ctx.organizationId,
        assignedToId: ctx.session.user.id,
        jobId: job.id,
      });
      return { ...result, considered: filtered.length, total: rows.length };
    }),

  // Preview the produced CSV without importing — used for filter UI
  previewResults: organizationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.prisma.scraperJob.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        select: { outputDir: true },
      });
      if (!job?.outputDir) return { rows: [] as Array<Record<string, string>> };
      const rows = await readScrapedCsv(job.outputDir);
      return { rows: rows.slice(0, 200) };
    }),
});
