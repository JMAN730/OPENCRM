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
        const sevenDaysAgo = subDays(today, 6); // 7-day window including today
        const fourteenDaysAgo = subDays(today, 13); // start of prev 7-day window

        const [
          callsTodayCount,
          followupsDueCount,
          outcomeDistribution,
          leadsByStatusResult,
          recentCalls,
          callsPerDayRows,
          connectedCallsPerDayRows,
          connectedCallsPrev7d,
          totalCallsPrev7d,
        ] = await Promise.all([
          ctx.prisma.callLog.count({
            where: { lead: { organizationId }, createdAt: { gte: today, lt: tomorrow } },
          }),
          ctx.prisma.task.count({
            where: { organizationId, status: { not: "COMPLETED" }, dueDate: { gte: today, lt: tomorrow }, deletedAt: null },
          }),
          ctx.prisma.lead.groupBy({
            by: ["callOutcome"],
            where: { organizationId, callOutcome: { not: "NOT_CONTACTED" } },
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
            include: { lead: { select: { phone: true, callOutcome: true } } },
          }),
          // All calls per day (last 7 days) — for total sparkline + callsToday delta
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
          // CONNECTED calls per day (last 7 days) — for answer-rate sparkline
          ctx.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
            SELECT date_trunc('day', cl."createdAt") AS day,
                   COUNT(*)::bigint AS count
            FROM "CallLog" cl
            JOIN "Lead" l ON cl."leadId" = l.id
            WHERE l."organizationId" = ${organizationId}
              AND cl.status = 'CONNECTED'
              AND cl."createdAt" >= ${sevenDaysAgo}
            GROUP BY 1
            ORDER BY 1 ASC
          `,
          // CONNECTED calls in prev 7-day window — for delta on connected KPI
          ctx.prisma.callLog.count({
            where: {
              lead: { organizationId },
              status: "CONNECTED",
              createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
            },
          }),
          // Total calls in prev 7-day window — for answer-rate delta
          ctx.prisma.callLog.count({
            where: {
              lead: { organizationId },
              createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
            },
          }),
        ]);

        // Derive totals from the status groupBy result.
        const totalLeadsCount = leadsByStatusResult.reduce((acc, s) => acc + s._count.id, 0);
        const statusCounts = new Map<string, number>();
        for (const row of leadsByStatusResult) {
          if (row.callOutcome === "CUSTOM") continue;
          statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + row._count.id);
        }
        const leadsByStatus = Array.from(statusCounts, ([status, count]) => ({ status, count }));
        const qualifiedLeadsCount =
          leadsByStatus.find((s) => s.status === "CONNECTED")?.count ?? 0;

        const conversionRate =
          totalLeadsCount > 0
            ? ((qualifiedLeadsCount / totalLeadsCount) * 100).toFixed(1)
            : "0.0";

        // Helper: zero-fill a day-bucketed raw query into a 7-entry array.
        const fillDays = (rows: Array<{ day: Date; count: bigint }>) => {
          const m = new Map<string, number>();
          for (const row of rows) {
            m.set(new Date(row.day).toISOString().split("T")[0], Number(row.count));
          }
          return Array.from({ length: 7 }, (_, idx) => {
            const date = subDays(today, 6 - idx);
            const key = date.toISOString().split("T")[0];
            return { date: key, count: m.get(key) ?? 0 };
          });
        };

        const callsPerDay = fillDays(callsPerDayRows);
        const connectedCallsPerDay = fillDays(connectedCallsPerDayRows);
        // Derived call-outcome KPI values
        const totalCallsLast7d = callsPerDay.reduce((s, d) => s + d.count, 0);
        const connectedCallsLast7d = connectedCallsPerDay.reduce((s, d) => s + d.count, 0);
        // yesterday = index 5 (index 6 = today)
        const callsYesterday = callsPerDay[5]?.count ?? 0;

        // Answer rate as a percentage string (e.g. "27.4%")
        const answerRateLast7d = totalCallsLast7d > 0
          ? ((connectedCallsLast7d / totalCallsLast7d) * 100).toFixed(1)
          : null;
        const answerRatePrev7d = totalCallsPrev7d > 0
          ? ((connectedCallsPrev7d / totalCallsPrev7d) * 100).toFixed(1)
          : null;

        return {
          totalLeads: totalLeadsCount,
          callsToday: callsTodayCount,
          callsYesterday,
          qualifiedLeads: qualifiedLeadsCount,
          followupsDue: followupsDueCount,
          conversionRate: `${conversionRate}%`,
          // Call-outcome KPI values
          connectedCallsLast7d,
          connectedCallsPrev7d,
          totalCallsLast7d,
          totalCallsPrev7d,
          answerRateLast7d,
          answerRatePrev7d,
          leadsByStatus,
          recentCalls: recentCalls.map((c) => ({
            id: c.id,
            status: c.status,
            callOutcome: c.lead?.callOutcome ?? null,
            duration: c.duration,
            createdAt: c.createdAt.toISOString(),
            phone: c.lead?.phone ?? "Unknown",
          })),
          charts: {
            callsPerDay,
            connectedCallsPerDay,
            outcomeDistribution: outcomeDistribution.map((item) => ({
              outcome: item.callOutcome,
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
            where: { organizationId, status: { not: "COMPLETED" }, deletedAt: null },
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
          // Latest activity timestamp per member — one row per user, no in-memory scan
          ctx.prisma.activity.groupBy({
            by: ["userId"],
            where: { user: { organizationId } },
            _max: { createdAt: true },
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
        const lastActiveMap = new Map(
          memberActivityRows.map((r) => [r.userId, r._max.createdAt]),
        );

        const memberStats = users.map((u) => ({
          userId: u.id,
          name: u.name,
          email: u.email,
          image: u.image,
          callCount: callMap.get(u.id) ?? 0,
          leadsAssigned: leadMap.get(u.id) ?? 0,
          lastActive: (lastActiveMap.get(u.id) ?? null)?.toISOString() ?? null,
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

  getMyPhoneReach: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const organizationId = (ctx.session.user as { organizationId?: string }).organizationId;

    if (!organizationId) return [];

    const [standardOutcomes, customGroups] = await Promise.all([
      ctx.prisma.lead.groupBy({
        by: ["callOutcome"],
        where: {
          organizationId,
          assignedToId: userId,
          callOutcome: { notIn: ["NOT_CONTACTED", "CUSTOM"] },
        },
        _count: { id: true },
      }),
      ctx.prisma.lead.groupBy({
        by: ["customOutcomeId"],
        where: {
          organizationId,
          assignedToId: userId,
          callOutcome: "CUSTOM",
        },
        _count: { id: true },
      }),
    ]);

    const customIds = customGroups
      .map((g) => g.customOutcomeId)
      .filter((id): id is string => !!id);

    const customLabels = customIds.length > 0
      ? await ctx.prisma.customOutcome.findMany({
          where: { id: { in: customIds } },
          select: { id: true, label: true },
        })
      : [];

    const labelById = new Map(customLabels.map((c) => [c.id, c.label]));

    return [
      ...standardOutcomes.map((item) => ({
        outcome: item.callOutcome as string,
        count: item._count.id,
      })),
      ...customGroups.map((item) => ({
        outcome: "CUSTOM" as string,
        customOutcomeId: item.customOutcomeId ?? undefined,
        label: item.customOutcomeId ? (labelById.get(item.customOutcomeId) ?? "Custom") : "Custom",
        count: item._count.id,
      })),
    ];
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
      ctx.prisma.task.count({ where: { userId, status: { not: "COMPLETED" }, deletedAt: null } }),
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
