import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { subDays } from "date-fns";
import { cached } from "@/lib/cache";
import { getLeadScope } from "@/server/teams/scope";
import { scopeCacheKey } from "@/features/ai/server/context";
import {
  getTopCallers,
  getLeadQuality,
  getRepPerformance,
} from "./salesAnalytics";
import { keys } from "@/lib/cacheKeys";

const SALES_TTL_SECONDS = 60;

function buildDayArray(
  rows: Array<{ day: Date; count: bigint }>,
  today: Date,
  n: number,
): Array<{ date: string; count: number }> {
  const map = new Map(
    rows.map((r) => [new Date(r.day).toISOString().split("T")[0], Number(r.count)]),
  );
  return Array.from({ length: n }, (_, i) => {
    const d = subDays(today, n - 1 - i);
    const key = d.toISOString().split("T")[0];
    return { date: key, count: map.get(key) ?? 0 };
  });
}

export const analyticsRouter = createTRPCRouter({
  overview: organizationProcedure.query(async ({ ctx }) => {
    const { organizationId } = ctx;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = subDays(today, 6);
    const thirtyDaysAgo = subDays(today, 29);

    const [
      leadsPerDayRows,
      callsPerDayRows,
      touchCountRows,
      bySourceRows,
      temperatureRows,
      totalLeads,
      leadsThisWeek,
      callsThisWeek,
      connectedCount,
    ] = await Promise.all([
      ctx.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "Lead"
        WHERE "organizationId" = ${organizationId}
          AND "createdAt" >= ${thirtyDaysAgo}
        GROUP BY 1 ORDER BY 1 ASC
      `,
      ctx.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', cl."createdAt") AS day, COUNT(*)::bigint AS count
        FROM "CallLog" cl
        JOIN "Lead" l ON cl."leadId" = l.id
        WHERE l."organizationId" = ${organizationId}
          AND cl."createdAt" >= ${thirtyDaysAgo}
        GROUP BY 1 ORDER BY 1 ASC
      `,
      ctx.prisma.lead.groupBy({
        by: ["touchCount"],
        where: { organizationId },
        _count: { id: true },
      }),
      ctx.prisma.lead.groupBy({
        by: ["source"],
        where: { organizationId },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 20,
      }),
      ctx.prisma.lead.groupBy({
        by: ["temperatureOverride"],
        where: { organizationId },
        _count: { id: true },
      }),
      ctx.prisma.lead.count({ where: { organizationId } }),
      ctx.prisma.lead.count({
        where: { organizationId, createdAt: { gte: sevenDaysAgo } },
      }),
      ctx.prisma.callLog.count({
        where: { lead: { organizationId }, createdAt: { gte: sevenDaysAgo } },
      }),
      ctx.prisma.lead.count({
        where: { organizationId, status: "CONNECTED", callOutcome: { not: "CUSTOM" } },
      }),
    ]);

    // Touch depth buckets
    const touchDepth = { untouched: 0, one: 0, twoToFive: 0, sixPlus: 0 };
    for (const row of touchCountRows) {
      const n = row.touchCount;
      const c = row._count.id;
      if (n === 0) touchDepth.untouched += c;
      else if (n === 1) touchDepth.one += c;
      else if (n <= 5) touchDepth.twoToFive += c;
      else touchDepth.sixPlus += c;
    }

    // Source normalization: collapse GoogleMaps/* variants into one bucket
    const sourceMap = new Map<string, number>();
    for (const row of bySourceRows) {
      const raw = row.source ?? "";
      const key = raw.startsWith("GoogleMaps") ? "Google Maps" : raw || "Manual entry";
      sourceMap.set(key, (sourceMap.get(key) ?? 0) + row._count.id);
    }
    const bySource = Array.from(sourceMap, ([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const contactRate =
      totalLeads > 0
        ? (((totalLeads - touchDepth.untouched) / totalLeads) * 100).toFixed(1)
        : "0.0";

    return {
      kpis: { totalLeads, leadsThisWeek, callsThisWeek, connectedCount, contactRate },
      leadsPerDay: buildDayArray(leadsPerDayRows, today, 30),
      callsPerDay: buildDayArray(callsPerDayRows, today, 30),
      touchDepth,
      bySource,
      byTemperature: temperatureRows
        .map((r) => ({ temperature: r.temperatureOverride ?? "Auto", count: r._count.id }))
        .sort((a, b) => b.count - a.count),
    };
  }),

  topCallers: organizationProcedure.query(async ({ ctx }) => {
    const scope = await getLeadScope(ctx);
    return cached(
      { key: keys.analyticsTopCallers(scopeCacheKey(scope)), ttl: SALES_TTL_SECONDS },
      () => getTopCallers(ctx.prisma, scope),
    );
  }),

  leadQuality: organizationProcedure.query(async ({ ctx }) => {
    const scope = await getLeadScope(ctx);
    return cached(
      { key: keys.analyticsLeadQuality(scopeCacheKey(scope)), ttl: SALES_TTL_SECONDS },
      () => getLeadQuality(ctx.prisma, scope),
    );
  }),

  repPerformance: organizationProcedure.query(async ({ ctx }) => {
    const scope = await getLeadScope(ctx);
    return cached(
      { key: keys.analyticsRepPerformance(scopeCacheKey(scope)), ttl: SALES_TTL_SECONDS },
      () => getRepPerformance(ctx.prisma, scope),
    );
  }),
});
