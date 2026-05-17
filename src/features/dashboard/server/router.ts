import { createTRPCRouter, organizationProcedure, protectedProcedure } from "@/server/trpc";
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
            where: { user: { organizationId }, status: { not: "COMPLETED" }, dueDate: { gte: today, lt: tomorrow } },
          }),
          ctx.prisma.lead.aggregate({
            where: {
              organizationId,
              status: "CONNECTED",
              callOutcome: { not: "CUSTOM" },
              createdAt: { gte: thirtyDaysAgo },
            },
            _sum: { value: true },
          }),
          ctx.prisma.callLog.groupBy({
            by: ["status"],
            where: { lead: { organizationId }, createdAt: { gte: thirtyDaysAgo } },
            _count: { id: true },
          }),
          ctx.prisma.lead.groupBy({
            by: ["status", "callOutcome"],
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
        const totalLeadsCount = leadsByStatusResult.reduce((acc, s) => acc + s._count.id, 0);
        const statusCounts = new Map<string, number>();
        for (const row of leadsByStatusResult) {
          if (row.callOutcome === "CUSTOM") continue;
          statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + row._count.id);
        }
        const leadsByStatus = Array.from(statusCounts, ([status, count]) => ({ status, count }));
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
            where: { user: { organizationId }, status: { not: "COMPLETED" } },
          }),
          ctx.prisma.scraperJob.count({
            where: { organizationId, status: { in: ["PENDING", "RUNNING"] } },
          }),
        ]);
        return { leads, tasks, scraperActive };
      },
    );
  }),

  getTeamStats: organizationProcedure.query(async ({ ctx }) => {
    const { organizationId } = ctx;
    return cached(
      { key: `dashboard:team:${organizationId}`, ttl: DASHBOARD_TTL_SECONDS },
      async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sevenDaysAgo = subDays(today, 6);

        const [
          totalCalls,
          callsThisWeek,
          leadsContacted,
          totalLeads,
          hotLeads,
          memberCallRows,
          memberLeadRows,
          memberActivityRows,
        ] = await Promise.all([
          ctx.prisma.callLog.count({ where: { lead: { organizationId } } }),
          ctx.prisma.callLog.count({
            where: { lead: { organizationId }, createdAt: { gte: sevenDaysAgo } },
          }),
          ctx.prisma.lead.count({
            where: { organizationId, status: "CONNECTED", callOutcome: { not: "CUSTOM" } },
          }),
          ctx.prisma.lead.count({ where: { organizationId } }),
          ctx.prisma.lead.count({ where: { organizationId, temperatureOverride: "HOT" } }),
          // Per-member call counts (all time)
          ctx.prisma.callLog.groupBy({
            by: ["userId"],
            where: { lead: { organizationId } },
            _count: { id: true },
          }),
          // Per-member lead assignment counts
          ctx.prisma.lead.groupBy({
            by: ["assignedToId"],
            where: { organizationId, assignedToId: { not: null } },
            _count: { id: true },
          }),
          // Latest activity per member for "last active"
          ctx.prisma.activity.findMany({
            where: { user: { organizationId } },
            orderBy: { createdAt: "desc" },
            take: 200,
            select: { userId: true, createdAt: true },
          }),
        ]);

        // Resolve user info for all members who have any data
        const userIds = new Set<string>([
          ...memberCallRows.map((r) => r.userId),
          ...memberLeadRows.map((r) => r.assignedToId!),
          ...memberActivityRows.map((r) => r.userId),
        ]);

        const users = await ctx.prisma.user.findMany({
          where: { id: { in: Array.from(userIds) }, organizationId },
          select: { id: true, name: true, email: true, image: true },
        });

        const callMap = new Map(memberCallRows.map((r) => [r.userId, r._count.id]));
        const leadMap = new Map(memberLeadRows.map((r) => [r.assignedToId!, r._count.id]));
        // Last active: first (most recent) activity per user
        const lastActiveMap = new Map<string, Date>();
        for (const a of memberActivityRows) {
          if (!lastActiveMap.has(a.userId)) lastActiveMap.set(a.userId, a.createdAt);
        }

        const memberStats = users.map((u) => ({
          userId: u.id,
          name: u.name,
          email: u.email,
          image: u.image,
          callCount: callMap.get(u.id) ?? 0,
          leadsAssigned: leadMap.get(u.id) ?? 0,
          lastActive: lastActiveMap.get(u.id)?.toISOString() ?? null,
        }));

        const conversionRate =
          totalLeads > 0 ? ((leadsContacted / totalLeads) * 100).toFixed(1) : "0.0";

        return {
          totalCalls,
          callsThisWeek,
          leadsContacted,
          totalLeads,
          hotLeads,
          conversionRate: `${conversionRate}%`,
          memberStats,
        };
      },
    );
  }),

  getMyStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const organizationId = (ctx.session.user as { organizationId?: string }).organizationId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = subDays(today, 6);

    const [callsToday, callsThisWeek, leadsAssigned, openTasks, recentActivity] = await Promise.all([
      ctx.prisma.callLog.count({
        where: { userId, createdAt: { gte: today, lt: tomorrow } },
      }),
      ctx.prisma.callLog.count({
        where: { userId, createdAt: { gte: sevenDaysAgo } },
      }),
      organizationId
        ? ctx.prisma.lead.count({ where: { organizationId, assignedToId: userId } })
        : Promise.resolve(0),
      ctx.prisma.task.count({ where: { userId, status: { not: "COMPLETED" } } }),
      ctx.prisma.activity.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, company: true } },
        },
      }),
    ]);

    return {
      callsToday,
      callsThisWeek,
      leadsAssigned,
      openTasks,
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        createdAt: a.createdAt.toISOString(),
        lead: a.lead
          ? {
              id: a.lead.id,
              name:
                [a.lead.firstName, a.lead.lastName].filter(Boolean).join(" ") ||
                a.lead.company ||
                "(lead)",
            }
          : null,
      })),
    };
  }),
});
