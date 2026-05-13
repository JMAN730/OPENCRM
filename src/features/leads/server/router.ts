import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getLeadScope, leadWhereFromScope } from "@/server/teams/scope";
import { logActivity } from "@/server/activity";
import { isAdmin } from "@/server/authz";

// Accept "" as a synonym for "absent" so optional URL/email fields don't reject
// empty form inputs. Real values are still validated by .email()/.url().
const optionalEmail = z.union([z.literal(""), z.string().email().max(255)]).optional();
const optionalUrl = z.union([z.literal(""), z.string().url().max(2048)]).optional();
const optionalShortString = (max: number) =>
  z.string().max(max).optional();

const leadInputSchema = z.object({
  firstName: optionalShortString(100),
  lastName: optionalShortString(100),
  email: optionalEmail,
  phone: optionalShortString(40),
  company: optionalShortString(200),
  website: optionalUrl,
  status: z
    .enum(["NOT_CONTACTED", "CONNECTED", "AI_VOICEMAIL", "NO_ANSWER", "HUNG_UP"])
    .default("NOT_CONTACTED"),
  source: optionalShortString(100),
});

const callOutcomeSchema = z.object({
  callOutcome: z.enum(["NOT_CONTACTED", "ANSWERED", "HUNG_UP", "NO_ANSWER", "AI_VOICEMAIL"]),
  callNotes: z.string().max(1000).optional(),
});

const includeAssignee = {
  assignedTo: { select: { id: true, name: true, email: true, image: true } },
} as const;

export const leadsRouter = createTRPCRouter({
  getAll: organizationProcedure
    .input(
      z
        .object({
          search: z.string().max(100).optional(),
          // Optional override (leaders/admins): only show one user's leads
          assignedToId: z.string().optional(),
          // "mine" (default scope), "team" (force team scope if leader/admin), "all" (admin only)
          scope: z.enum(["default", "mine", "team", "all"]).optional(),
          status: z
            .enum(["NOT_CONTACTED", "CONNECTED", "AI_VOICEMAIL", "NO_ANSWER", "HUNG_UP"])
            .optional(),
          limit: z.number().int().min(1).max(100).default(50),
          // Cursor encodes the last seen lead's id (the primary sort key
          // tie-breaker). Prisma's native cursor pagination handles the
          // composite order against (createdAt DESC, id DESC).
          cursor: z.string().optional(),
        })
        .optional()
        .default(() => ({ limit: 50 })),
    )
    .query(async ({ ctx, input }) => {
      const search = input.search?.trim();
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;
      const limit = input.limit ?? 50;

      const baseScope = await getLeadScope(ctx, userId, role);

      let where: Record<string, unknown> = leadWhereFromScope(baseScope);

      // Allow narrowing
      if (input.scope === "mine") {
        where = { organizationId: ctx.organizationId, assignedToId: userId };
      } else if (input.scope === "all" && !isAdmin(role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      } else if (input.scope === "all" && isAdmin(role)) {
        where = { organizationId: ctx.organizationId };
      }

      if (input.assignedToId) {
        const visibleUsers =
          baseScope.kind === "all" ? null : baseScope.userIds;
        if (visibleUsers && !visibleUsers.includes(input.assignedToId)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        where.assignedToId = input.assignedToId;
      }

      if (input.status) {
        where.status = input.status;
      }

      const finalWhere: Record<string, unknown> = {
        ...where,
        ...(search
          ? {
              OR: [
                { company: { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      // take = limit + 1 so we can detect whether another page exists
      // without a second count() round-trip.
      const rows = await ctx.prisma.lead.findMany({
        where: finalWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: includeAssignee,
        take: limit + 1,
        ...(input.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
      });

      let nextCursor: string | null = null;
      if (rows.length > limit) {
        const next = rows.pop();
        nextCursor = next?.id ?? null;
      }

      return { items: rows, nextCursor };
    }),

  getById: organizationProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, ...leadWhereFromScope(scope) },
        include: includeAssignee,
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return lead;
    }),

  delete: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, ...leadWhereFromScope(scope) },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return ctx.prisma.lead.delete({ where: { id: input.id } });
    }),

  create: organizationProcedure
    .input(leadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.create({
        data: {
          ...input,
          organizationId: ctx.organizationId,
          assignedToId: ctx.session.user.id,
        },
      });
      await logActivity(ctx.prisma, {
        leadId: lead.id,
        userId: ctx.session.user.id,
        type: "LEAD_CREATED",
        description: `Created lead ${[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.company || lead.email || "(unnamed)"}`,
      });
      return lead;
    }),

  bulkCreate: organizationProcedure
    .input(z.array(leadInputSchema).min(1).max(5000))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.lead.createMany({
        data: input.map((lead) => ({
          ...lead,
          organizationId: ctx.organizationId,
          assignedToId: ctx.session.user.id,
        })),
      });
      return { count: result.count };
    }),

  updateCallOutcome: organizationProcedure
    .input(z.object({ id: z.string(), ...callOutcomeSchema.shape }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, ...leadWhereFromScope(scope) },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      const outcomeToStatus: Record<string, string> = {
        ANSWERED:      "CONNECTED",
        AI_VOICEMAIL:  "AI_VOICEMAIL",
        NO_ANSWER:     "NO_ANSWER",
        HUNG_UP:       "HUNG_UP",
        NOT_CONTACTED: "NOT_CONTACTED",
      };
      const updated = await ctx.prisma.lead.update({
        where: { id: input.id },
        data: {
          callOutcome: input.callOutcome,
          callNotes: input.callNotes,
          status: outcomeToStatus[input.callOutcome] as any,
        },
      });
      await logActivity(ctx.prisma, {
        leadId: lead.id,
        userId: ctx.session.user.id,
        type: "CALL_OUTCOME",
        description: `Marked call outcome as ${input.callOutcome.replace(/_/g, " ").toLowerCase()}`,
      });
      return updated;
    }),

  /**
   * Reassigns one or more leads to another user.
   * Allowed for:
   *  - ADMINs (any user in their org)
   *  - Team leaders (only leads currently in their team scope, only to team members)
   */
  assign: organizationProcedure
    .input(
      z.object({
        leadIds: z.array(z.string()).min(1).max(500),
        assigneeId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const orgId = ctx.organizationId;
      const userId = ctx.session.user.id;

      // Find which teams (if any) this user leads
      const ledTeams = await ctx.prisma.team.findMany({
        where: { organizationId: orgId, leaderId: userId },
        select: { id: true, users: { select: { id: true } } },
      });

      if (!isAdmin(role) && ledTeams.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins or team leaders can reassign leads.",
        });
      }

      // Validate assignee belongs to the right scope
      if (input.assigneeId) {
        const assignee = await ctx.prisma.user.findFirst({
          where: { id: input.assigneeId, organizationId: orgId },
          select: { id: true, teamId: true, name: true, email: true },
        });
        if (!assignee) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Assignee not in this organization." });
        }
        if (!isAdmin(role)) {
          const leaderTeamIds = ledTeams.map((t) => t.id);
          if (!assignee.teamId || !leaderTeamIds.includes(assignee.teamId)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Assignee must be a member of a team you lead.",
            });
          }
        }
      }

      // Restrict which leads the caller can reassign
      const scope = await getLeadScope(ctx, userId, role);
      const leads = await ctx.prisma.lead.findMany({
        where: { id: { in: input.leadIds }, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (leads.length !== input.leadIds.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "One or more leads are outside your scope.",
        });
      }

      const result = await ctx.prisma.lead.updateMany({
        where: { id: { in: input.leadIds } },
        data: { assignedToId: input.assigneeId },
      });

      const assigneeName = input.assigneeId
        ? (await ctx.prisma.user.findUnique({
            where: { id: input.assigneeId },
            select: { name: true, email: true },
          }))?.name ?? "user"
        : "unassigned";

      // Replaces N per-lead activity.create round-trips with one batch insert.
      await ctx.prisma.activity.createMany({
        data: leads.map((l) => ({
          leadId: l.id,
          userId,
          type: "LEAD_ASSIGNED",
          description: input.assigneeId
            ? `Reassigned to ${assigneeName}`
            : `Unassigned`,
        })),
      });

      return { count: result.count };
    }),

  createNote: organizationProcedure
    .input(z.object({ leadId: z.string(), content: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      const note = await ctx.prisma.note.create({
        data: { content: input.content, leadId: input.leadId, userId: ctx.session.user.id },
      });
      await logActivity(ctx.prisma, {
        leadId: input.leadId,
        userId: ctx.session.user.id,
        type: "NOTE_ADDED",
        description: "Added a note",
      });
      return note;
    }),

  getNotes: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      // Defense-in-depth: filter Notes by the lead's organization in addition
      // to leadId, so a leaked Note relation can't escape the org boundary
      // even if the upstream scope check is ever bypassed.
      return ctx.prisma.note.findMany({
        where: {
          leadId: input.leadId,
          lead: { organizationId: ctx.organizationId },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      });
    }),

  /** Returns activities for a single lead (scope-filtered). */
  getActivities: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      // Defense-in-depth: same org join filter as getNotes.
      return ctx.prisma.activity.findMany({
        where: {
          leadId: input.leadId,
          lead: { organizationId: ctx.organizationId },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      });
    }),
});
