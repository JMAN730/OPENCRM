import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { subDays } from "date-fns";
import { cached } from "@/lib/cache";

const DASHBOARD_TTL_SECONDS = 60;

export const dashboardRouter = createTRPCRouter({
  getKpiStats: organizationProcedure.query(async ({ ctx }) => {
    const { organizationId } = ctx;

    return cached(
      { key: `dashboard:kpi:${organizationId}`, ttl: DASHBOARD_TTL_SECONDS },
      async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = subDays(new Date(), 30);
        const sevenDaysAgo = subDays(today, 6); // 7-day window including today

        // The previous implementation issued ~16 parallel queries, with seven
        // redundant per-day count() calls and three duplicated lead.count
        // queries for the same status. The fanout below collapses those into
        // five parallel reads plus one raw groupBy.
        const [
          callsTodayCount,
          followupsDueCount,
          revenueResult,
          callStatusDistribution,
          leadsByStatusResult,
          recentCalls,
          callsPerDayRows,
        ] = await Promise.all([
          ctx.prisma.callLog.count({
            where: { lead: { organizationId }, createdAt: { gte: today, lt: tomorrow } },
          }),
          ctx.prisma.task.count({
            where: { user: { organizationId }, completed: false, dueDate: { gte: today, lt: tomorrow } },
          }),
          ctx.prisma.lead.aggregate({
            where: { organizationId, status: "CONNECTED", createdAt: { gte: thirtyDaysAgo } },
            _sum: { value: true },
          }),
          ctx.prisma.callLog.groupBy({
            by: ["status"],
            where: { lead: { organizationId }, createdAt: { gte: thirtyDaysAgo } },
            _count: { id: true },
          }),
          ctx.prisma.lead.groupBy({
            by: ["status"],
            where: { organizationId },
            _count: { id: true },
          }),
          ctx.prisma.callLog.findMany({
            where: { lead: { organizationId } },
            orderBy: { createdAt: "desc" },
            take: 15,
            include: { lead: { select: { phone: true } } },
          }),
          // Single grouped query for the per-day chart bucket. date_trunc +
          // index-on-(userId, createdAt) keeps this O(matching rows) instead
          // of seven full table scans.
          ctx.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
            SELECT date_trunc('day', cl."createdAt") AS day,
                   COUNT(*)::bigint AS count
            FROM "CallLog" cl
            JOIN "Lead" l ON cl."leadId" = l.id
            WHERE l."organizationId" = ${organizationId}
              AND cl."createdAt" >= ${sevenDaysAgo}
            GROUP BY 1
            ORDER BY 1 ASC
          `,
        ]);

        // Derive totals from the status groupBy result so we don't issue
        // separate count() queries for total/qualified/appointments.
        const leadsByStatus = leadsByStatusResult.map((s) => ({
          status: s.status,
          count: s._count.id,
        }));
        const totalLeadsCount = leadsByStatus.reduce((acc, s) => acc + s.count, 0);
        const qualifiedLeadsCount =
          leadsByStatus.find((s) => s.status === "CONNECTED")?.count ?? 0;
        const appointmentsSetCount = qualifiedLeadsCount;

        // Fill in zero-count days so the chart always has 7 entries even on
        // a quiet week.
        const dayMap = new Map<string, number>();
        for (const row of callsPerDayRows) {
          const key = new Date(row.day).toISOString().split("T")[0];
          dayMap.set(key, Number(row.count));
        }
        const callsPerDay = Array.from({ length: 7 }, (_, idx) => {
          const date = subDays(today, 6 - idx);
          const key = date.toISOString().split("T")[0];
          return { date: key, count: dayMap.get(key) ?? 0 };
        });

        const conversionRate =
          totalLeadsCount > 0
            ? ((qualifiedLeadsCount / totalLeadsCount) * 100).toFixed(1)
            : "0.0";

        return {
          totalLeads: totalLeadsCount,
          callsToday: callsTodayCount,
          appointmentsSet: appointmentsSetCount,
          followupsDue: followupsDueCount,
          conversionRate: `${conversionRate}%`,
          monthlyRevenue: revenueResult._sum.value ?? 0,
          leadsByStatus,
          recentCalls: recentCalls.map((c) => ({
            id: c.id,
            status: c.status,
            duration: c.duration,
            createdAt: c.createdAt.toISOString(),
            phone: c.lead.phone ?? "Unknown",
          })),
          charts: {
            callsPerDay,
            statusDistribution: callStatusDistribution.map((item) => ({
              status: item.status,
              count: item._count.id,
            })),
          },
        };
      },
    );
  }),

  sidebarCounts: organizationProcedure.query(async ({ ctx }) => {
    const { organizationId } = ctx;
    return cached(
      { key: `dashboard:sidebar:${organizationId}`, ttl: 30 },
      async () => {
        const [leads, tasks, scraperActive] = await Promise.all([
          ctx.prisma.lead.count({ where: { organizationId } }),
          ctx.prisma.task.count({
            where: { user: { organizationId }, completed: false },
          }),
          ctx.prisma.scraperJob.count({
            where: { organizationId, status: { in: ["PENDING", "RUNNING"] } },
          }),
        ]);
        return { leads, tasks, scraperActive };
      },
    );
  }),
});
