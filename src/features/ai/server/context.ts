import type { PrismaClient } from "@prisma/client";
import { cached } from "@/lib/cache";
import { subDays } from "date-fns";
import {
  getTopCallers,
  getRepPerformance,
  getPipelineMetrics,
  getConversionInsights,
  type CallerStat,
  type RepPerformance,
  type PipelineMetrics,
  type ConversionInsights,
} from "@/features/analytics/server/salesAnalytics";

export const SALES_MANAGER_SYSTEM_PROMPT = `You are an AI sales manager inside OpenCRM.

Use CRM analytics and activity data to:
- identify top performers
- explain trends
- suggest improvements
- analyze lead quality
- coach sales reps
- detect pipeline issues

Always provide:
- actionable insights
- reasoning
- specific metrics
- concise explanations

Never say you lack data unless the metric truly does not exist.

Ground every claim in the metrics provided below. Do not invent numbers, names, or
trends that are not present in the data. When a metric is labelled "not tracked",
say so plainly and suggest how the team could start tracking it. Format answers in
concise markdown (short paragraphs, bullet lists, and bold for key numbers).`;

export type AIContext = {
  orgStatistics: {
    totalLeads: number;
    connectedLeads: number;
    conversionRate: number;
    callsTotal: number;
    callsThisWeek: number;
    connectedCallsThisWeek: number;
  };
  repRankings: CallerStat[];
  repPerformance: RepPerformance[];
  pipelineMetrics: PipelineMetrics;
  recentActivity: Array<{ type: string; description: string; at: string }>;
  conversionInsights: ConversionInsights;
};

type Db = Pick<PrismaClient, "lead" | "callLog" | "activity" | "user" | "$queryRaw">;

async function loadAIContext(db: Db, organizationId: string): Promise<AIContext> {
  const sevenDaysAgo = subDays(new Date(), 7);

  const [
    topCallers,
    repPerformance,
    pipelineMetrics,
    conversionInsights,
    callsTotal,
    callsThisWeek,
    connectedCallsThisWeek,
    recentActivityRows,
  ] = await Promise.all([
    getTopCallers(db, organizationId, { since: sevenDaysAgo }),
    getRepPerformance(db, organizationId),
    getPipelineMetrics(db, organizationId),
    getConversionInsights(db, organizationId),
    db.callLog.count({ where: { lead: { organizationId } } }),
    db.callLog.count({ where: { lead: { organizationId }, createdAt: { gte: sevenDaysAgo } } }),
    db.callLog.count({
      where: { lead: { organizationId }, status: "CONNECTED", createdAt: { gte: sevenDaysAgo } },
    }),
    db.activity.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { type: true, description: true, createdAt: true },
    }),
  ]);

  return {
    orgStatistics: {
      totalLeads: pipelineMetrics.total,
      connectedLeads: pipelineMetrics.connected,
      conversionRate: pipelineMetrics.conversionRate,
      callsTotal,
      callsThisWeek,
      connectedCallsThisWeek,
    },
    repRankings: topCallers.slice(0, 8),
    repPerformance,
    pipelineMetrics,
    conversionInsights,
    recentActivity: recentActivityRows.map((a) => ({
      type: String(a.type),
      description: a.description,
      at: a.createdAt.toISOString(),
    })),
  };
}

/** Cached (60s/org) structured sales analytics snapshot for the AI prompt. */
export async function buildAIContext(db: Db, organizationId: string): Promise<AIContext> {
  return cached(
    { key: `ai:context:${organizationId}`, ttl: 60 },
    () => loadAIContext(db, organizationId),
  );
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Render the structured context into a compact text block for the system prompt. */
export function formatAIContext(ctx: AIContext): string {
  const { orgStatistics: o } = ctx;

  const repLines =
    ctx.repRankings.length > 0
      ? ctx.repRankings
          .map(
            (r) =>
              `  - ${r.name}: ${r.connectionRate}% connect rate (${r.connectedCalls}/${r.totalCalls} calls, last 7d), ` +
              `${r.conversions} connected of ${r.leadsAssigned} assigned (${r.closeRate}% close)`,
          )
          .join("\n")
      : "  - No call activity recorded yet.";

  const perfLines =
    ctx.repPerformance.length > 0
      ? ctx.repPerformance
          .map((r) => {
            const resp =
              r.avgResponseHours == null
                ? "response time not tracked"
                : `${r.avgResponseHours}h avg first-response`;
            const pipe = r.pipelineValue > 0 ? money(r.pipelineValue) : "no deal value set";
            return `  - ${r.name}: ${resp}, ${r.followUpConsistency} avg touches, pipeline ${pipe}`;
          })
          .join("\n")
      : "  - No rep performance data yet.";

  const insight = (label: string, b: { key: string; conversionRate: number; total: number } | null) =>
    b ? `  - Best ${label}: ${b.key} (${b.conversionRate}% conversion, ${b.total} leads)` : `  - Best ${label}: not enough data`;

  const niches =
    ctx.conversionInsights.topNiches.length > 0
      ? ctx.conversionInsights.topNiches
          .map((n) => `    • ${n.key}: ${n.conversionRate}% (${n.converted}/${n.total})`)
          .join("\n")
      : "    • not enough data";

  const cities =
    ctx.conversionInsights.topCities.length > 0
      ? ctx.conversionInsights.topCities
          .map((c) => `    • ${c.key}: ${c.conversionRate}% (${c.converted}/${c.total})`)
          .join("\n")
      : "    • not enough data";

  const statusLines = ctx.pipelineMetrics.byStatus
    .map((s) => `${s.status}: ${s.count}`)
    .join(", ");

  const activity =
    ctx.recentActivity.length > 0
      ? ctx.recentActivity.map((a) => `  - ${a.type}: ${a.description}`).join("\n")
      : "  - No recent activity.";

  return [
    "LIVE CRM ANALYTICS (org-scoped, real data):",
    "",
    "Org statistics:",
    `  - Total leads: ${o.totalLeads}`,
    `  - Connected (converted) leads: ${o.connectedLeads}  →  ${o.conversionRate}% conversion rate`,
    `  - Calls: ${o.callsTotal} all-time, ${o.callsThisWeek} this week (${o.connectedCallsThisWeek} connected this week)`,
    "",
    "Rep rankings (cold-calling, last 7 days):",
    repLines,
    "",
    "Rep performance:",
    perfLines,
    "",
    "Conversion insights (min 3 leads/bucket):",
    insight("niche", ctx.conversionInsights.bestNiche),
    insight("city", ctx.conversionInsights.bestCity),
    insight("source", ctx.conversionInsights.bestSource),
    "  Top niches by conversion:",
    niches,
    "  Top cities by conversion:",
    cities,
    "",
    `Pipeline by status: ${statusLines || "none"}`,
    "",
    "Recent activity:",
    activity,
    "",
    "NOT TRACKED (no schema support — do not fabricate these):",
    "  - Booked appointments / meetings: there is no Appointment or booking model. To track this, add an appointment record or a BOOKED activity type and log it when a meeting is set.",
  ].join("\n");
}
