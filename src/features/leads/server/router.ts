import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { resolveLeadScope, leadWhereFromScope } from "@/server/teams/scope";
import { logActivity } from "@/server/activity";

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
    .enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "LOST", "WON"])
    .default("NEW"),
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
        })
        .optional()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const search = input.search?.trim();
      const role = (ctx.session.user as any).role as string;
      const userId = ctx.session.user.id;

      const baseScope = await resolveLeadScope(
        ctx.prisma,
        userId,
        ctx.organizationId,
        role,
      );

      let where: Record<string, unknown> = leadWhereFromScope(baseScope);

      // Allow narrowing
      if (input.scope === "mine") {
        where = { organizationId: ctx.organizationId, assignedToId: userId };
      } else if (input.scope === "all" && role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN" });
      } else if (input.scope === "all" && role === "ADMIN") {
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

      const finalWhere: any = {
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

      return ctx.prisma.lead.findMany({
        where: finalWhere,
        orderBy: { createdAt: "desc" },
        include: includeAssignee,
      });
    }),

  getById: organizationProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const role = (ctx.session.user as any).role as string;
      const scope = await resolveLeadScope(
        ctx.prisma,
        ctx.session.user.id,
        ctx.organizationId,
        role,
      );
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
      const role = (ctx.session.user as any).role as string;
      const scope = await resolveLeadScope(
        ctx.prisma,
        ctx.session.user.id,
        ctx.organizationId,
        role,
      );
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
      const role = (ctx.session.user as any).role as string;
      const scope = await resolveLeadScope(
        ctx.prisma,
        ctx.session.user.id,
        ctx.organizationId,
        role,
      );
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, ...leadWhereFromScope(scope) },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      const updated = await ctx.prisma.lead.update({
        where: { id: input.id },
        data: {
          callOutcome: input.callOutcome,
          callNotes: input.callNotes,
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
      const role = (ctx.session.user as any).role as string;
      const orgId = ctx.organizationId;
      const userId = ctx.session.user.id;

      // Find which teams (if any) this user leads
      const ledTeams = await ctx.prisma.team.findMany({
        where: { organizationId: orgId, leaderId: userId },
        select: { id: true, users: { select: { id: true } } },
      });

      if (role !== "ADMIN" && ledTeams.length === 0) {
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
        if (role !== "ADMIN") {
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
      const scope = await resolveLeadScope(ctx.prisma, userId, orgId, role);
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

      await Promise.all(
        leads.map((l) =>
          logActivity(ctx.prisma, {
            leadId: l.id,
            userId,
            type: "LEAD_ASSIGNED",
            description: input.assigneeId
              ? `Reassigned to ${assigneeName}`
              : `Unassigned`,
          }),
        ),
      );

      return { count: result.count };
    }),

  createNote: organizationProcedure
    .input(z.object({ leadId: z.string(), content: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const role = (ctx.session.user as any).role as string;
      const scope = await resolveLeadScope(ctx.prisma, ctx.session.user.id, ctx.organizationId, role);
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
      const role = (ctx.session.user as any).role as string;
      const scope = await resolveLeadScope(ctx.prisma, ctx.session.user.id, ctx.organizationId, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return ctx.prisma.note.findMany({
        where: { leadId: input.leadId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      });
    }),

  /** Returns activities for a single lead (scope-filtered). */
  getActivities: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const role = (ctx.session.user as any).role as string;
      const scope = await resolveLeadScope(
        ctx.prisma,
        ctx.session.user.id,
        ctx.organizationId,
        role,
      );
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.activity.findMany({
        where: { leadId: input.leadId },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      });
    }),
});
