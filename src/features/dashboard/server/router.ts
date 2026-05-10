import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { subDays } from "date-fns";

export const dashboardRouter = createTRPCRouter({
  getKpiStats: organizationProcedure.query(async ({ ctx }) => {
    const { organizationId } = ctx;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = subDays(new Date(), 30);

    const dayOffsets = [6, 5, 4, 3, 2, 1, 0];
    const [
      totalLeadsCount,
      callsTodayCount,
      appointmentsSetCount,
      followupsDueCount,
      qualifiedLeadsCount,
      revenueResult,
      statusDistribution,
      leadsByStatusResult,
      recentCalls,
      ...callsPerDayCounts
    ] = await Promise.all([
      ctx.prisma.lead.count({ where: { organizationId } }),
      ctx.prisma.callLog.count({
        where: { lead: { organizationId }, createdAt: { gte: today, lt: tomorrow } },
      }),
      ctx.prisma.lead.count({
        where: { organizationId, status: { in: ["QUALIFIED", "WON"] } },
      }),
      ctx.prisma.task.count({
        where: { user: { organizationId }, completed: false, dueDate: { gte: today, lt: tomorrow } },
      }),
      ctx.prisma.lead.count({ where: { organizationId, status: "QUALIFIED" } }),
      ctx.prisma.lead.aggregate({
        where: { organizationId, status: "WON", createdAt: { gte: thirtyDaysAgo } },
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
      ...dayOffsets.map((i) => {
        const date = subDays(today, i);
        return ctx.prisma.callLog.count({
          where: {
            lead: { organizationId },
            createdAt: { gte: date, lt: new Date(date.getTime() + 24 * 60 * 60 * 1000) },
          },
        });
      }),
    ]);

    const callsPerDay = dayOffsets.map((i, idx) => ({
      date: subDays(today, i).toISOString().split("T")[0],
      count: callsPerDayCounts[idx],
    }));

    const conversionRate = totalLeadsCount > 0
      ? ((qualifiedLeadsCount / totalLeadsCount) * 100).toFixed(1)
      : "0.0";

    return {
      totalLeads: totalLeadsCount,
      callsToday: callsTodayCount,
      appointmentsSet: appointmentsSetCount,
      followupsDue: followupsDueCount,
      conversionRate: `${conversionRate}%`,
      monthlyRevenue: revenueResult._sum.value ?? 0,
      leadsByStatus: leadsByStatusResult.map((s) => ({
        status: s.status,
        count: s._count.id,
      })),
      recentCalls: recentCalls.map((c) => ({
        id: c.id,
        status: c.status,
        duration: c.duration,
        createdAt: c.createdAt.toISOString(),
        phone: c.lead.phone ?? "Unknown",
      })),
      charts: {
        callsPerDay,
        statusDistribution: statusDistribution.map((item) => ({
          status: item.status,
          count: item._count.id,
        })),
      },
    };
  }),
});
