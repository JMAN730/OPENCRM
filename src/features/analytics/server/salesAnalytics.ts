import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { type LeadScope, leadWhereFromScope } from "@/server/teams/scope";
import { touchWhere, touchWhereSql } from "@/server/touches";

/**
 * Sales analytics service — pure, scope-aware metric functions used by the
 * analytics tRPC router. Every query is constrained
 * by the caller's LeadScope (ADMIN → whole org; team leader → their team's
 * assignees; everyone else → only themselves), mirroring how lead access is
 * restricted elsewhere via resolveLeadScope/leadWhereFromScope. Metrics are
 * derived only from real rows; a value that cannot be computed from the schema
 * is returned as `null` so callers can say "not tracked" rather than fabricate.
 *
 * Conversion definition: a lead is "converted" when its status is CONNECTED.
 */

type Db = Pick<PrismaClient, "lead" | "callLog" | "activity" | "user" | "$queryRaw">;

const ROUND = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
const rate = (part: number, total: number) => (total > 0 ? ROUND((part / total) * 100) : 0);

/** Lead `where` restricted to the rep(s) the scope permits (assigned leads only). */
function assignedWhere(scope: LeadScope) {
  return scope.kind === "users"
    ? { organizationId: scope.organizationId, assignedToId: { in: scope.userIds } }
    : { organizationId: scope.organizationId, assignedToId: { not: null } };
}

/**
 * Lead `source` strings carry niche + city in a "Channel / Niche / City, State"
 * shape (e.g. "GoogleMaps / Landscaping / Toledo, Ohio"). There is no dedicated
 * niche column, so niche always comes from parsing source. City prefers the
 * Lead.city column and falls back to the parsed segment.
 */
export function parseSource(source: string | null): {
  channel: string;
  niche: string;
  city: string;
} {
  if (!source) return { channel: "Manual entry", niche: "Unknown", city: "Unknown" };
  const parts = source.split("/").map((s) => s.trim()).filter(Boolean);
  if (source.startsWith("GoogleMaps")) {
    return {
      channel: "Google Maps",
      niche: parts[1] ?? "Unknown",
      city: (parts[2] ?? "Unknown").split(",")[0].trim() || "Unknown",
    };
  }
  return { channel: parts[0] || source, niche: "Unknown", city: "Unknown" };
}

export type CallerStat = {
  userId: string;
  name: string;
  totalCalls: number;
  connectedCalls: number;
  connectionRate: number;
  leadsAssigned: number;
  conversions: number;
  closeRate: number;
  /** No appointment/booking model exists in the schema. */
  bookedAppointments: null;
};

/**
 * Per-rep calling performance within the caller's scope. `since` (when
 * provided) bounds the call counts to a recent window; lead assignment/
 * conversion counts are all-time because assignment is not timestamped
 * distinctly from lead creation.
 */
export async function getTopCallers(
  db: Db,
  scope: LeadScope,
  opts: { since?: Date } = {},
): Promise<CallerStat[]> {
  const callUserFilter = scope.kind === "users" ? { userId: { in: scope.userIds } } : {};

  // Calls are Touch activities (see docs/adr/0002); "connected" means ANSWERED.
  const [callRows, leadRows] = await Promise.all([
    db.activity.groupBy({
      by: ["userId", "outcome"],
      where: {
        ...touchWhere(scope.organizationId),
        ...callUserFilter,
        ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
      },
      _count: { id: true },
    }),
    db.lead.groupBy({
      by: ["assignedToId", "status"],
      where: assignedWhere(scope),
      _count: { id: true },
    }),
  ]);

  const calls = new Map<string, { total: number; connected: number }>();
  for (const r of callRows) {
    const cur = calls.get(r.userId) ?? { total: 0, connected: 0 };
    cur.total += r._count.id;
    if (r.outcome === "ANSWERED") cur.connected += r._count.id;
    calls.set(r.userId, cur);
  }

  const leads = new Map<string, { assigned: number; converted: number }>();
  for (const r of leadRows) {
    const id = r.assignedToId;
    if (!id) continue;
    const cur = leads.get(id) ?? { assigned: 0, converted: 0 };
    cur.assigned += r._count.id;
    if (r.status === "CONNECTED") cur.converted += r._count.id;
    leads.set(id, cur);
  }

  const userIds = new Set<string>([...calls.keys(), ...leads.keys()]);
  if (userIds.size === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: Array.from(userIds) }, organizationId: scope.organizationId },
    select: { id: true, name: true, email: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name ?? u.email ?? "Unknown"]));

  return Array.from(userIds, (id) => {
    const c = calls.get(id) ?? { total: 0, connected: 0 };
    const l = leads.get(id) ?? { assigned: 0, converted: 0 };
    return {
      userId: id,
      name: nameById.get(id) ?? "Unknown",
      totalCalls: c.total,
      connectedCalls: c.connected,
      connectionRate: rate(c.connected, c.total),
      leadsAssigned: l.assigned,
      conversions: l.converted,
      closeRate: rate(l.converted, l.assigned),
      bookedAppointments: null,
    };
  }).sort(
    (a, b) =>
      b.connectionRate - a.connectionRate ||
      b.totalCalls - a.totalCalls ||
      b.conversions - a.conversions,
  );
}

export type QualityBucket = {
  key: string;
  total: number;
  converted: number;
  conversionRate: number;
};

export type LeadQuality = {
  byNiche: QualityBucket[];
  byCity: QualityBucket[];
  bySource: QualityBucket[];
};

/**
 * Conversion rates by niche, city, and acquisition channel for the leads the
 * caller can see. Niche/city are derived from the lead source string (city
 * falls back to that when the column is empty), grouped in the DB by
 * (source, city, status) to keep it cheap.
 */
export async function getLeadQuality(db: Db, scope: LeadScope): Promise<LeadQuality> {
  const rows = await db.lead.groupBy({
    by: ["source", "city", "status"],
    where: leadWhereFromScope(scope),
    _count: { id: true },
  });

  const niche = new Map<string, { total: number; converted: number }>();
  const city = new Map<string, { total: number; converted: number }>();
  const source = new Map<string, { total: number; converted: number }>();

  const bump = (
    map: Map<string, { total: number; converted: number }>,
    key: string,
    count: number,
    converted: boolean,
  ) => {
    if (key === "Unknown") return;
    const cur = map.get(key) ?? { total: 0, converted: 0 };
    cur.total += count;
    if (converted) cur.converted += count;
    map.set(key, cur);
  };

  for (const r of rows) {
    const parsed = parseSource(r.source);
    const cityKey = (r.city && r.city.trim()) || parsed.city;
    const count = r._count.id;
    const converted = r.status === "CONNECTED";
    bump(niche, parsed.niche, count, converted);
    bump(city, cityKey, count, converted);
    bump(source, parsed.channel, count, converted);
  }

  const toBuckets = (map: Map<string, { total: number; converted: number }>): QualityBucket[] =>
    Array.from(map, ([key, v]) => ({
      key,
      total: v.total,
      converted: v.converted,
      conversionRate: rate(v.converted, v.total),
    })).sort((a, b) => b.conversionRate - a.conversionRate || b.total - a.total);

  return {
    byNiche: toBuckets(niche),
    byCity: toBuckets(city),
    bySource: toBuckets(source),
  };
}

export type RepPerformance = {
  userId: string;
  name: string;
  /** Avg hours between lead creation and first call. Null when no calls logged. */
  avgResponseHours: number | null;
  /** Avg number of touches on this rep's contacted leads. */
  followUpConsistency: number;
  /** No appointment/booking model exists in the schema. */
  appointmentsBooked: null;
  pipelineValue: number;
  conversions: number;
};

export async function getRepPerformance(db: Db, scope: LeadScope): Promise<RepPerformance[]> {
  const where = assignedWhere(scope);
  const responseScope =
    scope.kind === "users"
      ? Prisma.sql`AND l."assignedToId" IN (${Prisma.join(scope.userIds)})`
      : Prisma.sql`AND l."assignedToId" IS NOT NULL`;

  const [valueRows, touchRows, convRows, responseRows] = await Promise.all([
    db.lead.groupBy({ by: ["assignedToId"], where, _sum: { value: true } }),
    db.lead.groupBy({
      by: ["assignedToId"],
      where: { ...where, touchCount: { gt: 0 } },
      _avg: { touchCount: true },
    }),
    db.lead.groupBy({
      by: ["assignedToId"],
      where: { ...where, status: "CONNECTED" },
      _count: { id: true },
    }),
    // Avg first-response time per rep: first touch timestamp minus lead creation
    // (calls are Touch activities — see docs/adr/0002).
    db.$queryRaw<Array<{ userId: string; avg_seconds: number | null }>>(Prisma.sql`
      SELECT l."assignedToId" AS "userId",
             AVG(EXTRACT(EPOCH FROM (fc.first_call - l."createdAt"))) AS avg_seconds
      FROM "Lead" l
      JOIN (
        SELECT "leadId", MIN("createdAt") AS first_call
        FROM "Activity" a
        WHERE a."organizationId" = ${scope.organizationId}
          AND ${touchWhereSql()}
        GROUP BY "leadId"
      ) fc ON fc."leadId" = l.id
      WHERE l."organizationId" = ${scope.organizationId}
        ${responseScope}
      GROUP BY l."assignedToId"
    `),
  ]);

  const valueById = new Map(
    valueRows.map((r) => [r.assignedToId!, Number(r._sum.value ?? 0)]),
  );
  const touchById = new Map(
    touchRows.map((r) => [r.assignedToId!, ROUND(r._avg.touchCount ?? 0)]),
  );
  const convById = new Map(convRows.map((r) => [r.assignedToId!, r._count.id]));
  const responseById = new Map(
    responseRows.map((r) => [
      r.userId,
      r.avg_seconds == null ? null : ROUND(Number(r.avg_seconds) / 3600),
    ]),
  );

  const userIds = new Set<string>([
    ...valueById.keys(),
    ...touchById.keys(),
    ...convById.keys(),
    ...responseById.keys(),
  ]);
  if (userIds.size === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: Array.from(userIds) }, organizationId: scope.organizationId },
    select: { id: true, name: true, email: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name ?? u.email ?? "Unknown"]));

  return Array.from(userIds, (id) => ({
    userId: id,
    name: nameById.get(id) ?? "Unknown",
    avgResponseHours: responseById.get(id) ?? null,
    followUpConsistency: touchById.get(id) ?? 0,
    appointmentsBooked: null,
    pipelineValue: valueById.get(id) ?? 0,
    conversions: convById.get(id) ?? 0,
  })).sort((a, b) => b.conversions - a.conversions || b.pipelineValue - a.pipelineValue);
}

