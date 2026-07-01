import path from "path";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { getLeadScope, leadWhereFromScope } from "@/server/teams/scope";
import { assertWithinRateLimit } from "@/lib/rateLimit";
import { logActivity } from "@/server/activity";
import { scraperConfig } from "@/server/scraper/config";
import { startEnrichmentJob } from "@/server/scraper/runner";
import {
  boundsSchema,
  bboxAreaDeg2,
  parseLatLngFromMapsUrl,
} from "@/features/map/shared/coords";
import {
  MAP_DISCOVERY_CATEGORIES,
  buildOverpassQuery,
  fetchOverpass,
  geocodeCityState,
  sleep,
  NOMINATIM_DELAY_MS,
} from "./osm";
import { writeEnrichInput, type EnrichTarget } from "./enrich";

// Overpass public instances struggle with country-sized queries; roughly a
// metro area at zoom ~11.
const MAX_DISCOVERY_BBOX_DEG2 = 0.05;
// Nominatim allows 1 req/s — keep each geocodeMissing call short so the
// mutation returns promptly and the client loops until remaining === 0.
const GEOCODE_PAIRS_PER_CALL = 8;
const MAPS_URL_PARSE_BATCH = 500;
const MAX_ENRICH_TARGETS = 100;

const osmBusinessSchema = z.object({
  osmType: z.string().max(20),
  osmId: z.number(),
  name: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  phone: z.string().max(40).optional(),
  website: z.string().max(2048).optional(),
});

function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export const mapRouter = createTRPCRouter({
  discoveryCategories: organizationProcedure.query(() => ({
    categories: Object.keys(MAP_DISCOVERY_CATEGORIES),
    enrichEnabled: scraperConfig.enabled,
  })),

  leadsInBounds: organizationProcedure
    .input(z.object({ bounds: boundsSchema }))
    .query(async ({ ctx, input }) => {
      const scope = await getLeadScope(ctx, ctx.session.user.id, ctx.session.user.role);
      const { bounds } = input;
      return ctx.prisma.lead.findMany({
        where: {
          ...leadWhereFromScope(scope),
          latitude: { gte: bounds.south, lte: bounds.north },
          longitude: { gte: bounds.west, lte: bounds.east },
        },
        select: {
          id: true,
          company: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          website: true,
          status: true,
          latitude: true,
          longitude: true,
        },
        take: 1000,
      });
    }),

  missingCoordinatesCount: organizationProcedure.query(async ({ ctx }) => {
    const scope = await getLeadScope(ctx, ctx.session.user.id, ctx.session.user.role);
    const count = await ctx.prisma.lead.count({
      where: { ...leadWhereFromScope(scope), latitude: null },
    });
    return { count };
  }),

  /**
   * Backfills coordinates for leads that don't have any yet. Two passes:
   * free offline parsing of Google Maps URLs, then Nominatim geocoding of
   * distinct (city, state) pairs. Bounded per call — the client re-invokes
   * until `remaining` reaches 0.
   */
  geocodeMissing: organizationProcedure.mutation(async ({ ctx }) => {
    await assertWithinRateLimit({
      key: `map:geocode:${ctx.organizationId}`,
      limit: 6,
      windowSeconds: 60,
    });

    const scope = await getLeadScope(ctx, ctx.session.user.id, ctx.session.user.role);
    const scopeWhere = leadWhereFromScope(scope);

    // Pass 1: parse coordinates straight out of stored Google Maps URLs.
    const withMapsUrl = await ctx.prisma.lead.findMany({
      where: { ...scopeWhere, latitude: null, mapsUrl: { not: null } },
      select: { id: true, mapsUrl: true },
      take: MAPS_URL_PARSE_BATCH,
    });
    let fromMapsUrl = 0;
    for (const lead of withMapsUrl) {
      const coords = parseLatLngFromMapsUrl(lead.mapsUrl);
      if (!coords) continue;
      await ctx.prisma.lead.update({
        where: { id: lead.id },
        data: { latitude: coords.lat, longitude: coords.lng },
      });
      fromMapsUrl++;
    }

    // Pass 2: geocode distinct (city, state) pairs for leads that still have
    // no coordinates (approximate city-centroid pins).
    const uncoordinated = await ctx.prisma.lead.findMany({
      where: {
        ...scopeWhere,
        latitude: null,
        city: { not: null },
        state: { not: null },
      },
      select: { city: true, state: true },
      distinct: ["city", "state"],
      take: GEOCODE_PAIRS_PER_CALL,
    });

    let geocoded = 0;
    for (let i = 0; i < uncoordinated.length; i++) {
      const { city, state } = uncoordinated[i];
      if (!city || !state) continue;
      let coords: { lat: number; lng: number } | null = null;
      try {
        coords = await geocodeCityState(city, state);
      } catch {
        // Nominatim hiccup — leave the pair for the next call.
        continue;
      } finally {
        if (i < uncoordinated.length - 1) await sleep(NOMINATIM_DELAY_MS);
      }
      if (!coords) continue;
      const updated = await ctx.prisma.lead.updateMany({
        where: { ...scopeWhere, latitude: null, city, state },
        data: { latitude: coords.lat, longitude: coords.lng },
      });
      geocoded += updated.count;
    }

    const remaining = await ctx.prisma.lead.count({
      where: { ...scopeWhere, latitude: null },
    });
    return { fromMapsUrl, geocoded, remaining };
  }),

  discoverBusinesses: organizationProcedure
    .input(
      z.object({
        bounds: boundsSchema,
        category: z.string().min(1).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const selectors = MAP_DISCOVERY_CATEGORIES[input.category];
      if (!selectors) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown category." });
      }
      if (bboxAreaDeg2(input.bounds) > MAX_DISCOVERY_BBOX_DEG2) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Zoom in to discover businesses.",
        });
      }
      await assertWithinRateLimit({
        key: `map:discover:${ctx.organizationId}`,
        limit: 30,
        windowSeconds: 60,
      });

      let businesses;
      try {
        businesses = await fetchOverpass(buildOverpassQuery(input.bounds, selectors));
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Business discovery timed out. Try again in a moment.",
        });
      }

      // Flag discoveries that already exist as leads (matched by normalized
      // phone against org leads inside the same viewport — bounded set).
      const existing = await ctx.prisma.lead.findMany({
        where: {
          organizationId: ctx.organizationId,
          latitude: { gte: input.bounds.south, lte: input.bounds.north },
          longitude: { gte: input.bounds.west, lte: input.bounds.east },
        },
        select: { id: true, phone: true, company: true },
        take: 2000,
      });
      const byPhone = new Map<string, string>();
      const byName = new Map<string, string>();
      for (const lead of existing) {
        const phone = normalizePhone(lead.phone);
        if (phone && !byPhone.has(phone)) byPhone.set(phone, lead.id);
        const name = (lead.company ?? "").trim().toLowerCase();
        if (name && !byName.has(name)) byName.set(name, lead.id);
      }

      const items = businesses.map((b) => {
        const phone = normalizePhone(b.phone);
        const existingLeadId =
          (phone ? byPhone.get(phone) : undefined) ??
          byName.get(b.name.trim().toLowerCase());
        return { ...b, existingLeadId };
      });
      return { items };
    }),

  enrich: organizationProcedure
    .input(
      z.object({
        leadIds: z.array(z.string()).max(MAX_ENRICH_TARGETS).default([]),
        osmBusinesses: z.array(osmBusinessSchema).max(MAX_ENRICH_TARGETS).default([]),
        category: z.string().max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!scraperConfig.enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Enrichment requires the scraper feature to be enabled.",
        });
      }
      const uniqueIds = [...new Set(input.leadIds)];
      if (uniqueIds.length + input.osmBusinesses.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing selected." });
      }
      if (uniqueIds.length + input.osmBusinesses.length > MAX_ENRICH_TARGETS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Select at most ${MAX_ENRICH_TARGETS} items per enrichment run.`,
        });
      }
      const userId = ctx.session.user.id;

      // Existing leads must be inside the caller's scope (same rule as bulkDelete).
      const scope = await getLeadScope(ctx, userId, ctx.session.user.role);
      const scopedLeads = await ctx.prisma.lead.findMany({
        where: { id: { in: uniqueIds }, ...leadWhereFromScope(scope) },
        select: { id: true, company: true, website: true, mapsUrl: true, phone: true },
      });
      if (scopedLeads.length !== uniqueIds.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "One or more leads are outside your scope.",
        });
      }

      // Dedup OSM selections against org leads by company name (case-insensitive)
      // and normalized phone — duplicates resolve to the existing lead instead
      // of creating a new row.
      const names = input.osmBusinesses.map((b) => b.name.trim()).filter(Boolean);
      const nameMatches = names.length
        ? await ctx.prisma.lead.findMany({
            where: {
              organizationId: ctx.organizationId,
              company: { in: names, mode: "insensitive" },
            },
            select: { id: true, company: true, phone: true },
          })
        : [];
      const existingByName = new Map<string, { id: string; phone: string | null }>();
      for (const lead of nameMatches) {
        const key = (lead.company ?? "").trim().toLowerCase();
        if (key && !existingByName.has(key)) {
          existingByName.set(key, { id: lead.id, phone: lead.phone });
        }
      }

      const toCreate: typeof input.osmBusinesses = [];
      let dedupedLeads = 0;
      const targets: EnrichTarget[] = scopedLeads.map((lead) => ({
        leadId: lead.id,
        name: lead.company ?? "",
        website: lead.website,
        mapsUrl: lead.mapsUrl,
        phone: lead.phone,
      }));
      const targetIds = new Set(scopedLeads.map((l) => l.id));

      for (const biz of input.osmBusinesses) {
        const match = existingByName.get(biz.name.trim().toLowerCase());
        if (match) {
          dedupedLeads++;
          if (!targetIds.has(match.id)) {
            targetIds.add(match.id);
            targets.push({
              leadId: match.id,
              name: biz.name,
              website: biz.website ?? null,
              phone: match.phone ?? biz.phone ?? null,
            });
          }
          continue;
        }
        toCreate.push(biz);
      }

      const source = `OpenStreetMap${input.category ? ` / ${input.category}` : ""}`;
      const createdLeads = toCreate.length
        ? await ctx.prisma.lead.createManyAndReturn({
            data: toCreate.map((biz) => ({
              company: biz.name,
              phone: biz.phone ?? null,
              website: biz.website ?? null,
              latitude: biz.lat,
              longitude: biz.lng,
              source,
              organizationId: ctx.organizationId,
              assignedToId: userId,
            })),
            select: { id: true, company: true, phone: true, website: true },
          })
        : [];

      await Promise.all(
        createdLeads.map((lead) =>
          logActivity(ctx.prisma, {
            leadId: lead.id,
            userId,
            type: "LEAD_CREATED",
            description: `Created from the lead map (${source})`,
            organizationId: ctx.organizationId,
          }),
        ),
      );

      for (const lead of createdLeads) {
        targets.push({
          leadId: lead.id,
          name: lead.company ?? "",
          website: lead.website,
          phone: lead.phone,
        });
      }

      const job = await ctx.prisma.scraperJob.create({
        data: {
          organizationId: ctx.organizationId,
          userId,
          jobType: "ENRICH",
          locations: [],
          categories: input.category ? [input.category] : [],
          autoImport: false,
          totalQueries: targets.length,
          status: "PENDING",
        },
      });

      const outDir = path.join(scraperConfig.outputBaseDir, job.id);
      await writeEnrichInput(outDir, targets);

      try {
        await startEnrichmentJob(job.id);
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
          message: e instanceof Error ? e.message : "Failed to start enrichment",
        });
      }

      return { jobId: job.id, createdLeads: createdLeads.length, dedupedLeads };
    }),

  enrichmentStatus: organizationProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.prisma.scraperJob.findFirst({
        where: { id: input.jobId, organizationId: ctx.organizationId, jobType: "ENRICH" },
        select: {
          status: true,
          totalQueries: true,
          completedQueries: true,
          failedQueries: true,
          error: true,
          completedAt: true,
        },
      });
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      return job;
    }),
});
