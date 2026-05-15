import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { assertAdmin, assertCanGrantRole, isAdmin, ROLE_VALUES } from "@/server/authz";
import { invalidateLeadScope } from "@/server/teams/scope";

async function findLedTeam(prisma: PrismaClient, userId: string, orgId: string, teamId: string) {
  return prisma.team.findFirst({
    where: { id: teamId, organizationId: orgId, leaderId: userId },
    select: { id: true },
  });
}

async function assertTeamInOrg(
  prisma: PrismaClient,
  teamId: string,
  orgId: string,
  message = "Team not in organization.",
): Promise<void> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: orgId },
    select: { id: true },
  });
  if (!team) throw new TRPCError({ code: "BAD_REQUEST", message });
}

export const teamsRouter = createTRPCRouter({
  /** All teams in the org, with members and leader. */
  list: organizationProcedure.query(({ ctx }) => {
    return ctx.prisma.team.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        leader: { select: { id: true, name: true, email: true, image: true } },
        users: { select: { id: true, name: true, email: true, image: true, role: true } },
      },
      orderBy: { name: "asc" },
    });
  }),

  /** All users in the org — used by admin UIs to populate team membership pickers. */
  organizationMembers: organizationProcedure.query(({ ctx }) => {
    return ctx.prisma.user.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        teamId: true,
        team: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });
  }),

  /**
   * The team the current user belongs to (or leads), with members.
   * Returns null if the user is not on a team and leads none.
   */
  myTeam: organizationProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const team = await ctx.prisma.team.findFirst({
      where: {
        organizationId: ctx.organizationId,
        OR: [{ users: { some: { id: userId } } }, { leaderId: userId }],
      },
      include: {
        leader: { select: { id: true, name: true, email: true, image: true } },
        users: {
          select: { id: true, name: true, email: true, image: true, role: true },
          orderBy: { name: "asc" },
        },
      },
    });
    return team;
  }),

  /** Recent activities by everyone on the same team as the caller, with cursor pagination. */
  activityFeed: organizationProcedure
    .input(
      z
        .object({
          teamId: z.string().optional(),
          limit: z.number().int().min(1).max(200).optional(),
          cursor: z.string().optional(),
        })
        .optional()
        .default(() => ({})),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const role = ctx.session.user.role;

      const team = input.teamId
        ? await ctx.prisma.team.findFirst({
            where: { id: input.teamId, organizationId: ctx.organizationId },
            include: {
              users: { select: { id: true } },
            },
          })
        : await ctx.prisma.team.findFirst({
            where: {
              organizationId: ctx.organizationId,
              OR: [{ users: { some: { id: userId } } }, { leaderId: userId }],
            },
            include: {
              users: { select: { id: true } },
            },
          });

      if (!team) return { items: [], nextCursor: null };

      // Authorization: must be on the team, lead the team, or be ADMIN.
      const memberIds = team.users.map((u) => u.id);
      const isMember = memberIds.includes(userId);
      const isLeader = (await findLedTeam(ctx.prisma as PrismaClient, userId, ctx.organizationId, team.id)) !== null;
      if (!isAdmin(role) && !isMember && !isLeader) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const limit = input.limit ?? 10;
      const items = await ctx.prisma.activity.findMany({
        where: { userId: { in: memberIds } },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          lead: { select: { id: true, firstName: true, lastName: true, company: true } },
        },
      });

      let nextCursor: string | null = null;
      if (items.length > limit) {
        const last = items.pop();
        nextCursor = last!.id;
      }

      return { items, nextCursor };
    }),

  /**
   * Snapshot of a single team member's account — leads + recent activity + counters.
   * Accessible to ADMINs, the user themselves, or the leader of one of their teams.
   */
  memberDetail: organizationProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const callerId = ctx.session.user.id;

      const target = await ctx.prisma.user.findFirst({
        where: { id: input.userId, organizationId: ctx.organizationId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          teamId: true,
          team: { select: { id: true, name: true, leaderId: true } },
        },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      const allowed =
        isAdmin(role) ||
        callerId === target.id ||
        (target.team?.leaderId && target.team.leaderId === callerId);

      if (!allowed) throw new TRPCError({ code: "FORBIDDEN" });

      const [leads, recentCalls, openTasks, leadCount, callCount] = await Promise.all([
        ctx.prisma.lead.findMany({
          where: {
            organizationId: ctx.organizationId,
            assignedToId: target.id,
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        ctx.prisma.callLog.findMany({
          where: { userId: target.id, lead: { organizationId: ctx.organizationId } },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { lead: { select: { id: true, firstName: true, lastName: true, company: true } } },
        }),
        ctx.prisma.task.findMany({
          where: { userId: target.id, completed: false },
          orderBy: { dueDate: "asc" },
          take: 20,
        }),
        ctx.prisma.lead.count({
          where: { organizationId: ctx.organizationId, assignedToId: target.id },
        }),
        ctx.prisma.callLog.count({
          where: { userId: target.id, lead: { organizationId: ctx.organizationId } },
        }),
      ]);

      return { user: target, leads, recentCalls, openTasks, leadCount, callCount };
    }),

  // ── Admin/leader management ────────────────────────────────────────────────

  create: organizationProcedure
    .input(z.object({ name: z.string().min(1).max(80), leaderId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session.user.role);
      if (input.leaderId) {
        const leader = await ctx.prisma.user.findFirst({
          where: { id: input.leaderId, organizationId: ctx.organizationId },
          select: { id: true },
        });
        if (!leader) throw new TRPCError({ code: "BAD_REQUEST", message: "Leader not in organization." });
      }
      return ctx.prisma.team.create({
        data: {
          name: input.name,
          organizationId: ctx.organizationId,
          leaderId: input.leaderId,
        },
      });
    }),

  update: organizationProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80).optional(),
        leaderId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session.user.role);
      const team = await ctx.prisma.team.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: { users: { select: { id: true } } },
      });
      if (!team) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.leaderId) {
        const leader = await ctx.prisma.user.findFirst({
          where: { id: input.leaderId, organizationId: ctx.organizationId },
          select: { id: true },
        });
        if (!leader) throw new TRPCError({ code: "BAD_REQUEST", message: "Leader not in organization." });
      }
      const updated = await ctx.prisma.team.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.leaderId !== undefined ? { leaderId: input.leaderId } : {}),
        },
      });
      // If the leader changed, invalidate the scope cache for both the
      // previous and current leader since their visible-leads set just shifted.
      if (input.leaderId !== undefined) {
        const affected = new Set<string>();
        if (team.leaderId) affected.add(team.leaderId);
        if (input.leaderId) affected.add(input.leaderId);
        await Promise.all(Array.from(affected).map((id) => invalidateLeadScope(id)));
      }
      return updated;
    }),

  delete: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session.user.role);
      const team = await ctx.prisma.team.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: { users: { select: { id: true } } },
      });
      if (!team) throw new TRPCError({ code: "NOT_FOUND" });
      // Detach members first (User.teamId is nullable).
      await ctx.prisma.user.updateMany({
        where: { teamId: input.id },
        data: { teamId: null },
      });
      const result = await ctx.prisma.team.delete({ where: { id: input.id } });
      // Bust scope cache for the leader and every former member.
      const affected = new Set<string>(team.users.map((u) => u.id));
      if (team.leaderId) affected.add(team.leaderId);
      await Promise.all(Array.from(affected).map((id) => invalidateLeadScope(id)));
      return result;
    }),

  /**
   * Create a new user account inside the caller's organization (admin only).
   * If the email already exists with no org assigned, that account is claimed
   * into this org instead of creating a duplicate.
   *
   * Phase 4 replaces this with an email-token invite flow. For now it
   * remains admin-set-password but with the cross-org and role-escalation
   * holes plugged.
   */
  inviteUser: organizationProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        email: z.string().email().max(255),
        password: z.string().min(8).max(255),
        role: z.enum(ROLE_VALUES).default("USER"),
        teamId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session.user.role);
      assertCanGrantRole(ctx.session.user.role, input.role);

      // Critical: teamId is attacker-controlled, so it MUST be validated
      // against the caller's org before we touch the user row.
      if (input.teamId) {
        await assertTeamInOrg(
          ctx.prisma as PrismaClient,
          input.teamId,
          ctx.organizationId,
          "Team is not part of your organization.",
        );
      }

      const email = input.email.toLowerCase().trim();
      const existing = await ctx.prisma.user.findUnique({ where: { email } });

      if (existing) {
        if (existing.organizationId === ctx.organizationId) {
          throw new TRPCError({ code: "CONFLICT", message: "User already in your organization." });
        }
        if (existing.organizationId) {
          throw new TRPCError({ code: "CONFLICT", message: "User already belongs to another organization." });
        }
        // Unaffiliated account — assign it to this org.
        return ctx.prisma.user.update({
          where: { id: existing.id },
          data: {
            organizationId: ctx.organizationId,
            role: input.role,
            ...(input.teamId ? { teamId: input.teamId } : {}),
          },
          select: { id: true, name: true, email: true, role: true },
        });
      }

      const hashed = await bcrypt.hash(input.password, 12);
      return ctx.prisma.user.create({
        data: {
          name: input.name,
          email,
          password: hashed,
          role: input.role,
          organizationId: ctx.organizationId,
          ...(input.teamId ? { teamId: input.teamId } : {}),
        },
        select: { id: true, name: true, email: true, role: true },
      });
    }),

  /**
   * Add or move a user into a team.
   * Admins can manage any team; team leaders can manage only the teams they lead.
   */
  setMembership: organizationProcedure
    .input(z.object({ userId: z.string(), teamId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const callerId = ctx.session.user.id;

      const user = await ctx.prisma.user.findFirst({
        where: { id: input.userId, organizationId: ctx.organizationId },
        select: { id: true, teamId: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      if (!isAdmin(role)) {
        // Leader can only move members into/out of a team they lead.
        const targetTeamId = input.teamId ?? user.teamId;
        if (!targetTeamId) throw new TRPCError({ code: "FORBIDDEN" });
        const led = await findLedTeam(
          ctx.prisma as PrismaClient,
          callerId,
          ctx.organizationId,
          targetTeamId,
        );
        if (!led) throw new TRPCError({ code: "FORBIDDEN" });
      } else if (input.teamId) {
        await assertTeamInOrg(ctx.prisma as PrismaClient, input.teamId, ctx.organizationId);
      }

      const updated = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { teamId: input.teamId },
      });
      // Scope changed for: the moved user, the leader of the destination team
      // (if any), and the leader of the source team (if different).
      const affected = new Set<string>([input.userId]);
      if (input.teamId) {
        const dest = await ctx.prisma.team.findFirst({
          where: { id: input.teamId },
          select: { leaderId: true },
        });
        if (dest?.leaderId) affected.add(dest.leaderId);
      }
      if (user.teamId && user.teamId !== input.teamId) {
        const src = await ctx.prisma.team.findFirst({
          where: { id: user.teamId },
          select: { leaderId: true },
        });
        if (src?.leaderId) affected.add(src.leaderId);
      }
      await Promise.all(Array.from(affected).map((id) => invalidateLeadScope(id)));
      return updated;
    }),
});
