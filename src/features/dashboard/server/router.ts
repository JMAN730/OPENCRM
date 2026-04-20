import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { subDays } from "date-fns";

export const dashboardRouter = createTRPCRouter({
  getKpiStats: protectedProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.session.user.organizationId;

    if (!organizationId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User organization not found." });
    }

    const totalLeadsCount = await ctx.prisma.lead.count({
      where: { organizationId },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const callsTodayCount = await ctx.prisma.callLog.count({
      where: {
        lead: { organizationId },
        createdAt: { gte: today, lt: tomorrow },
      },
    });

    const appointmentsSetCount = await ctx.prisma.lead.count({
      where: {
        organizationId,
        status: { in: ["QUALIFIED", "WON"] },
      },
    });

    const followupsDueCount = await ctx.prisma.task.count({
      where: {
        lead: { organizationId },
        completed: false,
        dueDate: { gte: today, lt: tomorrow },
      },
    });

    const qualifiedLeadsCount = await ctx.prisma.lead.count({
      where: { organizationId, status: "QUALIFIED" },
    });
    const conversionRate = totalLeadsCount > 0
      ? ((qualifiedLeadsCount / totalLeadsCount) * 100).toFixed(1)
      : "0.0";

    const callsPerDay = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const count = await ctx.prisma.callLog.count({
        where: {
          lead: { organizationId },
          createdAt: { gte: date, lt: new Date(date.getTime() + 24 * 60 * 60 * 1000) },
        },
      });
      callsPerDay.push({ date: date.toISOString().split("T")[0], count });
    }

    const statusDistribution = await ctx.prisma.callLog.groupBy({
      by: ["status"],
      where: {
        lead: { organizationId },
        createdAt: { gte: subDays(new Date(), 30) },
      },
      _count: { id: true },
    });

    return {
      totalLeads: totalLeadsCount,
      callsToday: callsTodayCount,
      appointmentsSet: appointmentsSetCount,
      followupsDue: followupsDueCount,
      conversionRate: `${conversionRate}%`,
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
