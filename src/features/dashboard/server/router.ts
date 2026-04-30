import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { subDays } from "date-fns";

export const dashboardRouter = createTRPCRouter({
  getKpiStats: protectedProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.session.user.organizationId;

    if (!organizationId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User organization not found." });
    }

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
        where: { lead: { organizationId }, completed: false, dueDate: { gte: today, lt: tomorrow } },
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

    const monthlyRevenue = revenueResult._sum.value ?? 0;

    return {
      totalLeads: totalLeadsCount,
      callsToday: callsTodayCount,
      appointmentsSet: appointmentsSetCount,
      followupsDue: followupsDueCount,
      conversionRate: `${conversionRate}%`,
      monthlyRevenue,
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
