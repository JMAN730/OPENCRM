import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { customOutcomesRouter } from "./customOutcomesRouter";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma, type LeadStatus, type LeadTemperatureOverride } from "@prisma/client";
import { getLeadScope, leadWhereFromScope } from "@/server/teams/scope";
import { logActivity } from "@/server/activity";
import { isAdmin, isManagerOrAdmin } from "@/server/authz";
import { normalizeState, parseCityState, parseLocationSearch } from "@/features/leads/location";

// Accept "" as a synonym for "absent" so optional URL/email fields don't reject
// empty form inputs. Real values are still validated by .email()/.url().
const optionalEmail = z.union([z.literal(""), z.string().email().max(255)]).optional();
const optionalUrl = z.union([z.literal(""), z.string().url().max(2048)]).optional();
const optionalShortString = (max: number) =>
  z.string().max(max).optional();
const optionalRating = z.number().min(0).max(5).optional();
const optionalReviewCount = z.number().int().min(0).optional();
const optionalTemperatureOverride = z.enum(["HOT", "WARM", "COOL"]).nullable();

const leadInputSchema = z.object({
  firstName: optionalShortString(100),
  lastName: optionalShortString(100),
  email: optionalEmail,
  phone: optionalShortString(40),
  company: optionalShortString(200),
  city: optionalShortString(100),
  state: optionalShortString(40),
  website: optionalUrl,
  rating: optionalRating,
  reviewCount: optionalReviewCount,
  status: z
    .enum(["NOT_CONTACTED", "CONNECTED", "AI_VOICEMAIL", "NO_ANSWER", "HUNG_UP"])
    .default("NOT_CONTACTED"),
  source: optionalShortString(100),
});

const callOutcomeSchema = z.object({
  callOutcome: z.enum(["NOT_CONTACTED", "ANSWERED", "HUNG_UP", "NO_ANSWER", "AI_VOICEMAIL", "CUSTOM"]),
  customOutcomeId: z.string().optional(),
  callNotes: z.string().max(1000).optional(),
});
type CallOutcomeInput = z.infer<typeof callOutcomeSchema>["callOutcome"];
type LeadInput = z.infer<typeof leadInputSchema>;

function normalizeLeadInput(input: LeadInput): LeadInput {
  const parsedLocation = parseCityState(input.city);
  const state = normalizeState(input.state) ?? parsedLocation.state;
  return {
    ...input,
    city: parsedLocation.state ? parsedLocation.city : input.city,
    state,
  };
}

function searchWhere(search?: string): Record<string, unknown> {
  if (!search) return {};

  const generalSearch = [
    { company: { contains: search, mode: "insensitive" } },
    { firstName: { contains: search, mode: "insensitive" } },
    { lastName: { contains: search, mode: "insensitive" } },
    { email: { contains: search, mode: "insensitive" } },
    { phone: { contains: search, mode: "insensitive" } },
  ];

  const location = parseLocationSearch(search);
  if (location) {
    return {
      OR: [
        ...generalSearch,
        {
          AND: [
            { state: location.state },
            ...(location.city
              ? [{ city: { contains: location.city, mode: "insensitive" } }]
              : []),
          ],
        },
        { city: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  return {
    OR: generalSearch,
  };
}

const includeAssignee = {
  assignedTo: { select: { id: true, name: true, email: true, image: true } },
  customOutcome: { select: { id: true, label: true, hint: true } },
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
          hasPhone: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).default(100),
          // Cursor encodes the last seen lead's id (the primary sort key
          // tie-breaker). Prisma's native cursor pagination handles the
          // composite order against (createdAt DESC, id DESC).
          cursor: z.string().optional(),
        })
        .optional()
        .default(() => ({ limit: 100 })),
    )
    .query(async ({ ctx, input }) => {
      const search = input.search?.trim();
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;
      const limit = input.limit ?? 100;

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

      if (input.hasPhone) {
        where.phone = { not: null };
      }

      const finalWhere: Record<string, unknown> = {
        ...where,
        ...searchWhere(search),
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

  bulkDelete: organizationProcedure
    .input(z.object({ leadIds: z.array(z.string()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;

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

      const result = await ctx.prisma.lead.deleteMany({
        where: { id: { in: input.leadIds } },
      });

      await Promise.all(
        input.leadIds.map((leadId) =>
          logActivity(ctx.prisma, {
            leadId,
            userId,
            type: "LEAD_DELETED",
            description: "Deleted lead",
          }),
        ),
      );

      return { count: result.count };
    }),

  create: organizationProcedure
    .input(leadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const data = normalizeLeadInput(input);
      const lead = await ctx.prisma.lead.create({
        data: {
          ...data,
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
      const normalizeEmail = (email?: string) => (email ?? "").trim().toLowerCase();
      const normalizePhone = (phone?: string) => (phone ?? "").replace(/\D/g, "");

      const cleaned = input.map((l) => {
        const email = normalizeEmail(l.email);
        const phone = normalizePhone(l.phone);
        const normalized = normalizeLeadInput(l);
        return {
          ...normalized,
          email: email || undefined,
          phone: phone || undefined,
        };
      });

      // De-dupe within the payload first so we don't create duplicates from a single import.
      const seenKeys = new Set<string>();
      const deduped = cleaned.filter((l) => {
        const email = normalizeEmail(l.email);
        const phone = normalizePhone(l.phone);
        const key =
          email ? `email:${email}` :
          phone ? `phone:${phone}` :
          `name:${(l.company ?? "").trim().toLowerCase()}|${(l.firstName ?? "").trim().toLowerCase()}|${(l.lastName ?? "").trim().toLowerCase()}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      const emails = Array.from(
        new Set(deduped.map((l) => normalizeEmail(l.email)).filter(Boolean)),
      );
      const phones = Array.from(
        new Set(deduped.map((l) => normalizePhone(l.phone)).filter(Boolean)),
      );

      const existing =
        emails.length === 0 && phones.length === 0
          ? []
          : await ctx.prisma.lead.findMany({
              where: {
                organizationId: ctx.organizationId,
                OR: [
                  ...(emails.length ? [{ email: { in: emails } }] : []),
                  ...(phones.length ? [{ phone: { in: phones } }] : []),
                ],
              },
              select: { id: true, email: true, phone: true, status: true },
            });

      const byEmail = new Map<string, (typeof existing)[number]>();
      const byPhone = new Map<string, (typeof existing)[number]>();
      for (const lead of existing) {
        const e = normalizeEmail(lead.email ?? undefined);
        const p = normalizePhone(lead.phone ?? undefined);
        if (e && !byEmail.has(e)) byEmail.set(e, lead);
        if (p && !byPhone.has(p)) byPhone.set(p, lead);
      }

      const toCreate: Array<z.infer<typeof leadInputSchema> & { organizationId: string; assignedToId: string }> = [];
      const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];

      for (const row of deduped) {
        const email = normalizeEmail(row.email);
        const phone = normalizePhone(row.phone);
        const match = (email && byEmail.get(email)) || (phone && byPhone.get(phone));

        if (!match) {
          toCreate.push({
            ...row,
            organizationId: ctx.organizationId,
            assignedToId: ctx.session.user.id,
          });
          continue;
        }

        const data: Record<string, unknown> = {};

        // Only fill in missing fields; don't wipe existing data.
        if (row.firstName) data.firstName = row.firstName;
        if (row.lastName) data.lastName = row.lastName;
        if (row.company) data.company = row.company;
        if (row.city) data.city = row.city;
        if (row.state) data.state = row.state;
        if (row.website) data.website = row.website;
        if (row.source) data.source = row.source;
        if (typeof row.rating === "number") data.rating = row.rating;
        if (typeof row.reviewCount === "number") data.reviewCount = row.reviewCount;
        if (email) data.email = email;
        if (phone) data.phone = phone;

        // Status: preserve existing progress unless the import explicitly advances it.
        if (row.status && match.status === "NOT_CONTACTED" && row.status !== "NOT_CONTACTED") {
          data.status = row.status;
        }

        if (Object.keys(data).length > 0) {
          toUpdate.push({ id: match.id, data });
        }
      }

      const ops: Prisma.PrismaPromise<unknown>[] = [];
      if (toCreate.length) {
        ops.push(ctx.prisma.lead.createMany({ data: toCreate }));
      }
      for (const u of toUpdate) {
        ops.push(ctx.prisma.lead.update({ where: { id: u.id }, data: u.data }));
      }

      const results = ops.length ? await ctx.prisma.$transaction(ops) : [];
      const created = toCreate.length ? (results[0] as { count: number }).count : 0;
      const updated = toUpdate.length;

      return { count: created + updated };
    }),

  updateTemperatureOverride: organizationProcedure
    .input(z.object({ id: z.string(), temperatureOverride: optionalTemperatureOverride }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, ...leadWhereFromScope(scope) },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });

      const updated = await ctx.prisma.lead.update({
        where: { id: input.id },
        data: {
          temperatureOverride: input.temperatureOverride as LeadTemperatureOverride | null,
        },
      });

      await logActivity(ctx.prisma, {
        leadId: lead.id,
        userId: ctx.session.user.id,
        type: "LEAD_TEMPERATURE_OVERRIDE",
        description: input.temperatureOverride
          ? `Set temperature override to ${input.temperatureOverride.toLowerCase()}`
          : "Cleared temperature override",
      });

      return updated;
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

      if (input.callOutcome === "CUSTOM") {
        if (!input.customOutcomeId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "customOutcomeId is required for CUSTOM outcome." });
        }
        const customOutcome = await ctx.prisma.customOutcome.findFirst({
          where: { id: input.customOutcomeId, organizationId: ctx.organizationId },
          select: { id: true },
        });
        if (!customOutcome) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Custom outcome not found." });
        }
      }

      const outcomeToStatus: Record<CallOutcomeInput, LeadStatus> = {
        ANSWERED:      "CONNECTED",
        AI_VOICEMAIL:  "AI_VOICEMAIL",
        NO_ANSWER:     "NO_ANSWER",
        HUNG_UP:       "HUNG_UP",
        NOT_CONTACTED: "NOT_CONTACTED",
        CUSTOM:        "CONNECTED",
      };
      const updated = await ctx.prisma.lead.update({
        where: { id: input.id },
        data: {
          callOutcome: input.callOutcome,
          callNotes: input.callNotes,
          status: outcomeToStatus[input.callOutcome],
          customOutcomeId: input.customOutcomeId ?? null,
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

  toggleStar: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, ...leadWhereFromScope(scope) },
        select: { id: true, starred: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return ctx.prisma.lead.update({
        where: { id: lead.id },
        data: { starred: !lead.starred },
      });
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
          const leaderTeamIds = ledTeams.map((t: { id: string }) => t.id);
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

  deleteNote: organizationProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.noteId, lead: { organizationId: ctx.organizationId } },
        select: { id: true, userId: true, leadId: true },
      });
      if (!note) throw new TRPCError({ code: "NOT_FOUND" });
      const callerId = ctx.session.user.id;
      const callerRole = ctx.session.user.role;
      if (note.userId !== callerId && !isManagerOrAdmin(callerRole)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.prisma.note.delete({ where: { id: note.id } });
      await logActivity(ctx.prisma, {
        leadId: note.leadId,
        userId: callerId,
        type: "NOTE_DELETED",
        description: "Deleted a note",
      });
      return { success: true };
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

  customOutcomes: customOutcomesRouter,
});
