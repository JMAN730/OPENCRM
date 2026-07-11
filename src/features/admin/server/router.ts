import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, superAdminProcedure } from "@/server/trpc";
import { subDays } from "date-fns";

/**
 * Platform monitoring router ("master account" console).
 *
 * Every procedure here is READ-ONLY and deliberately NOT scoped by
 * organizationId — that is the whole point of the super-admin view. Access is
 * gated by `superAdminProcedure`, which requires `User.isSuperAdmin`. Never add
 * a mutation to this router: monitoring must not be able to alter tenant data.
 */
export const platformRouter = createTRPCRouter({
  // Cross-org KPI strip for the monitoring dashboard.
  overview: superAdminProcedure.query(async ({ ctx }) => {
    const sevenDaysAgo = subDays(new Date(), 7);

    const [
      organizations,
      users,
      teams,
      leads,
      calls,
      newOrganizations7d,
      newUsers7d,
      subscriptionsByTier,
      subscriptionsByStatus,
    ] = await Promise.all([
      ctx.prisma.organization.count(),
      ctx.prisma.user.count(),
      ctx.prisma.team.count(),
      ctx.prisma.lead.count(),
      ctx.prisma.callLog.count(),
      ctx.prisma.organization.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      ctx.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      ctx.prisma.organizationSubscription.groupBy({
        by: ["planTier"],
        _count: { id: true },
      }),
      ctx.prisma.organizationSubscription.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
    ]);

    return {
      organizations,
      users,
      teams,
      leads,
      calls,
      newOrganizations7d,
      newUsers7d,
      subscriptionsByTier: subscriptionsByTier.map((r) => ({
        planTier: r.planTier,
        count: r._count.id,
      })),
      subscriptionsByStatus: subscriptionsByStatus.map((r) => ({
        status: r.status,
        count: r._count.id,
      })),
    };
  }),

  // Every organization on the platform, with rollup counts + subscription.
  organizations: superAdminProcedure
    .input(
      z
        .object({ search: z.string().trim().max(200).optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const search = input?.search;
      const orgs = await ctx.prisma.organization.findMany({
        where: search
          ? { name: { contains: search, mode: "insensitive" } }
          : undefined,
        select: {
          id: true,
          name: true,
          createdAt: true,
          subscription: {
            select: { planTier: true, status: true, seatLimit: true, trialEndsAt: true },
          },
          _count: { select: { users: true, teams: true, leads: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });

      return orgs.map((o) => ({
        id: o.id,
        name: o.name,
        createdAt: o.createdAt.toISOString(),
        planTier: o.subscription?.planTier ?? null,
        subscriptionStatus: o.subscription?.status ?? null,
        seatLimit: o.subscription?.seatLimit ?? null,
        trialEndsAt: o.subscription?.trialEndsAt?.toISOString() ?? null,
        userCount: o._count.users,
        teamCount: o._count.teams,
        leadCount: o._count.leads,
      }));
    }),

  // Every user on the platform. Never selects the password hash.
  users: superAdminProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(200).optional(),
          organizationId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const search = input?.search;
      const users = await ctx.prisma.user.findMany({
        where: {
          ...(input?.organizationId ? { organizationId: input.organizationId } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isSuperAdmin: true,
          createdAt: true,
          organization: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });

      return users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isSuperAdmin: u.isSuperAdmin,
        createdAt: u.createdAt.toISOString(),
        organizationId: u.organization?.id ?? null,
        organizationName: u.organization?.name ?? null,
        teamName: u.team?.name ?? null,
      }));
    }),

  // Drill-in: one organization's teams (with leaders/members) + full roster.
  organizationDetail: superAdminProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          subscription: {
            select: { planTier: true, status: true, seatLimit: true, trialEndsAt: true, currentPeriodEnd: true },
          },
          teams: {
            select: {
              id: true,
              name: true,
              leader: { select: { id: true, name: true, email: true } },
              _count: { select: { users: true } },
            },
            orderBy: { createdAt: "asc" },
          },
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isSuperAdmin: true,
              teamId: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found." });
      }

      return {
        id: org.id,
        name: org.name,
        createdAt: org.createdAt.toISOString(),
        subscription: org.subscription
          ? {
              planTier: org.subscription.planTier,
              status: org.subscription.status,
              seatLimit: org.subscription.seatLimit,
              trialEndsAt: org.subscription.trialEndsAt?.toISOString() ?? null,
              currentPeriodEnd: org.subscription.currentPeriodEnd?.toISOString() ?? null,
            }
          : null,
        teams: org.teams.map((t) => ({
          id: t.id,
          name: t.name,
          leaderName: t.leader?.name ?? t.leader?.email ?? null,
          memberCount: t._count.users,
        })),
        users: org.users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          isSuperAdmin: u.isSuperAdmin,
          teamId: u.teamId,
          createdAt: u.createdAt.toISOString(),
        })),
      };
    }),
});
