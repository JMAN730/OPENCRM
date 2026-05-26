import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { customOutcomesRouter } from "./customOutcomesRouter";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma, type LeadStatus, type LeadTemperatureOverride } from "@prisma/client";
import { getLeadScope, leadWhereFromScope } from "@/server/teams/scope";
import { logActivity } from "@/server/activity";
import { isAdmin, isManagerOrAdmin } from "@/server/authz";
import { normalizeState, parseCityState, parseLocationSearch } from "@/features/leads/location";
import { invalidate } from "@/lib/cache";

// Accept "" as a synonym for "absent" so optional URL/email fields don't reject
// empty form inputs. Real values are still validated by .email()/.url().
const optionalEmail = z.union([z.literal(""), z.string().email().max(255)]).optional();
const optionalUrl = z.union([z.literal(""), z.string().url().max(2048)]).optional();
const optionalShortString = (max: number) =>
  z.string().max(max).optional();
const optionalRating = z.number().min(0).max(5).optional();
const optionalReviewCount = z.number().int().min(0).optional();
// Accepts a number (programmatic callers) or a numeric string (form inputs);
// an empty string is treated as "absent" so the column stays null.
const optionalValue = z
  .union([z.literal(""), z.coerce.number().min(0).max(1_000_000_000)])
  .optional()
  .transform((v) => (v === "" ? undefined : v));
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
  mapsUrl: optionalUrl,
  rating: optionalRating,
  reviewCount: optionalReviewCount,
  value: optionalValue,
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
  secondaryOutcome: { select: { id: true, label: true, hint: true } },
  tags: { select: { id: true, name: true }, orderBy: { name: "asc" } },
  // _count is what drives the "Touches" count in the UI — it must reflect
  // real interactions (CallLog rows, Notes), not derived data like
  // Activity entries or call outcome heuristics.
  _count: { select: { calls: true, notes: true } },
} as const;

function buildQualificationSummary(lead: {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  source: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  status: LeadStatus;
  callOutcome: CallOutcomeInput;
  temperatureOverride: LeadTemperatureOverride | null;
}) {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.company || "This lead";
  const location = [lead.city, lead.state].filter(Boolean).join(", ");
  const status =
    lead.callOutcome && lead.callOutcome !== "NOT_CONTACTED"
      ? lead.callOutcome.replace(/_/g, " ").toLowerCase()
      : lead.status.replace(/_/g, " ").toLowerCase();
  const signals: string[] = [];

  if (typeof lead.rating === "number") {
    const reviews = typeof lead.reviewCount === "number" ? ` across ${lead.reviewCount} reviews` : "";
    signals.push(`${lead.rating.toFixed(1)} star rating${reviews}`);
  }
  if (lead.phone) signals.push("callable phone number");
  if (lead.email) signals.push("email contact data");
  if (lead.website) signals.push("website found");
  if (lead.source) signals.push(`source category: ${lead.source}`);

  const temperature = lead.temperatureOverride?.toLowerCase() ?? "scored";
  const intro = `${name}${location ? ` in ${location}` : ""} is a ${temperature} lead currently marked ${status}.`;
  if (signals.length === 0) {
    return `${intro} There is limited enrichment data, so qualify this lead through direct outreach before prioritizing follow-up.`;
  }
  return `${intro} Signals: ${signals.join(", ")}.`;
}

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
          stages: z
            .array(z.enum(["NOT_CONTACTED", "CONNECTED", "AI_VOICEMAIL", "NO_ANSWER", "HUNG_UP"]))
            .optional(),
          hasPhone: z.boolean().optional(),
          assignedToIds: z.array(z.string()).optional(),
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

      if (input.assignedToIds?.length) {
        const visibleUsers = baseScope.kind === "all" ? null : baseScope.userIds;
        const allowed = visibleUsers
          ? input.assignedToIds.filter((id) => visibleUsers.includes(id))
          : input.assignedToIds;
        if (!allowed.length) throw new TRPCError({ code: "FORBIDDEN" });
        where.assignedToId = { in: allowed };
      }

      if (input.status) {
        where.status = input.status;
        where.callOutcome = { not: "CUSTOM" };
      }

      if (input.stages?.length) {
        where.status = { in: input.stages };
        where.callOutcome = { not: "CUSTOM" };
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

  getStatusCounts: organizationProcedure
    .input(
      z
        .object({
          search: z.string().max(100).optional(),
          scope: z.enum(["default", "mine", "team", "all"]).optional(),
          assignedToIds: z.array(z.string()).optional(),
        })
        .optional()
        .default(() => ({})),
    )
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;
      const baseScope = await getLeadScope(ctx, userId, role);

      let where: Record<string, unknown> = leadWhereFromScope(baseScope);

      if (input.scope === "mine") {
        where = { organizationId: ctx.organizationId, assignedToId: userId };
      } else if (input.scope === "all" && !isAdmin(role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      } else if (input.scope === "all" && isAdmin(role)) {
        where = { organizationId: ctx.organizationId };
      }

      if (input.assignedToIds?.length) {
        const visibleUsers = baseScope.kind === "all" ? null : baseScope.userIds;
        const allowed = visibleUsers
          ? input.assignedToIds.filter((id) => visibleUsers.includes(id))
          : input.assignedToIds;
        if (allowed.length) where.assignedToId = { in: allowed };
      }

      const search = input.search?.trim();
      const finalWhere = { ...where, ...searchWhere(search) };

      const [standardRows, customRows, notContactedCount] = await Promise.all([
        ctx.prisma.lead.groupBy({
          by: ["status"],
          where: {
            AND: [
              finalWhere,
              { callOutcome: { not: null } },
              { callOutcome: { not: "NOT_CONTACTED" } },
              { callOutcome: { not: "CUSTOM" } },
            ],
          } as Record<string, unknown>,
          _count: { id: true },
        }),
        ctx.prisma.lead.groupBy({
          by: ["customOutcomeId"],
          where: {
            AND: [finalWhere, { callOutcome: "CUSTOM" }],
          } as Record<string, unknown>,
          _count: { id: true },
        }),
        ctx.prisma.lead.count({
          where: {
            AND: [
              finalWhere,
              { OR: [{ callOutcome: null }, { callOutcome: "NOT_CONTACTED" }] },
            ],
          } as Record<string, unknown>,
        }),
      ]);

      const counts: Record<string, number> = { NOT_CONTACTED: notContactedCount };
      for (const row of standardRows) counts[row.status] = row._count.id;
      for (const row of customRows) {
        if (row.customOutcomeId) counts[`CUSTOM:${row.customOutcomeId}`] = row._count.id;
      }
      return counts;
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
      const uniqueIds = [...new Set(input.leadIds)];

      const scope = await getLeadScope(ctx, userId, role);
      const leads = await ctx.prisma.lead.findMany({
        where: { id: { in: uniqueIds }, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (leads.length !== uniqueIds.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "One or more leads are outside your scope.",
        });
      }

      const result = await ctx.prisma.lead.deleteMany({
        where: { id: { in: uniqueIds } },
      });

      await Promise.all(
        uniqueIds.map((leadId) =>
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
    .input(
      z.object({
        leads: z.array(leadInputSchema).min(1).max(5000),
        assigneeId: z.string().nullish(),
        tagIds: z.array(z.string()).max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const normalizeEmail = (email?: string) => (email ?? "").trim().toLowerCase();
      const normalizePhone = (phone?: string) => (phone ?? "").replace(/\D/g, "");

      // Permission check: assigning to someone else requires manager/admin
      let effectiveAssigneeId = ctx.session.user.id;
      if (input.assigneeId != null && input.assigneeId !== ctx.session.user.id) {
        if (!isManagerOrAdmin(ctx.session.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only managers or admins can assign leads to others." });
        }
        const assignee = await ctx.prisma.user.findFirst({
          where: { id: input.assigneeId, organizationId: ctx.organizationId },
          select: { id: true },
        });
        if (!assignee) throw new TRPCError({ code: "BAD_REQUEST", message: "Assignee not in this organization." });
        effectiveAssigneeId = input.assigneeId;
      }

      // Validate tag IDs belong to this org (deduplicate first — findMany collapses duplicates)
      const uniqueTagIds = input.tagIds?.length ? [...new Set(input.tagIds)] : [];
      const validTags = uniqueTagIds.length
        ? await ctx.prisma.leadTag.findMany({
            where: { id: { in: uniqueTagIds }, organizationId: ctx.organizationId },
            select: { id: true },
          })
        : [];
      if (uniqueTagIds.length && validTags.length !== uniqueTagIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "One or more tags not found." });
      }

      const cleaned = input.leads.map((l) => {
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
            assignedToId: effectiveAssigneeId,
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
        if (row.mapsUrl) data.mapsUrl = row.mapsUrl;
        if (row.source) data.source = row.source;
        if (typeof row.rating === "number") data.rating = row.rating;
        if (typeof row.reviewCount === "number") data.reviewCount = row.reviewCount;
        if (email) data.email = email;
        if (phone) data.phone = phone;

        // Status: preserve existing progress unless the import explicitly advances it.
        if (row.status && match.status === "NOT_CONTACTED" && row.status !== "NOT_CONTACTED") {
          data.status = row.status;
        }

        // Always apply explicit assignee override on updates
        if (input.assigneeId != null) {
          data.assignedToId = effectiveAssigneeId;
        }

        if (Object.keys(data).length > 0) {
          toUpdate.push({ id: match.id, data });
        }
      }

      const ops: Prisma.PrismaPromise<unknown>[] = [];
      if (toCreate.length) {
        ops.push(ctx.prisma.lead.createManyAndReturn({ data: toCreate, select: { id: true } }));
      }
      for (const u of toUpdate) {
        ops.push(ctx.prisma.lead.update({ where: { id: u.id }, data: u.data }));
      }

      const results = ops.length ? await ctx.prisma.$transaction(ops) : [];
      const createdIds = toCreate.length ? (results[0] as { id: string }[]).map((r) => r.id) : [];
      const updatedIds = toUpdate.map((u) => u.id);
      const allAffectedIds = [...createdIds, ...updatedIds];

      if (validTags.length && allAffectedIds.length) {
        await Promise.all(
          validTags.map((tag) =>
            ctx.prisma.leadTag.update({
              where: { id: tag.id },
              data: { leads: { connect: allAffectedIds.map((id) => ({ id })) } },
            }),
          ),
        );
      }

      return { count: createdIds.length + updatedIds.length };
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

  updateValue: organizationProcedure
    .input(z.object({ id: z.string(), value: z.number().min(0).max(1_000_000_000).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, ...leadWhereFromScope(scope) },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });

      const updated = await ctx.prisma.lead.update({
        where: { id: input.id },
        data: { value: input.value },
      });

      await logActivity(ctx.prisma, {
        leadId: lead.id,
        userId: ctx.session.user.id,
        type: "LEAD_VALUE_UPDATED",
        description:
          input.value != null
            ? `Set estimated value to $${input.value.toLocaleString("en-US")}`
            : "Cleared estimated value",
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

      const outcomeToStatus: Record<Exclude<CallOutcomeInput, "CUSTOM">, LeadStatus> = {
        ANSWERED:      "CONNECTED",
        AI_VOICEMAIL:  "AI_VOICEMAIL",
        NO_ANSWER:     "NO_ANSWER",
        HUNG_UP:       "HUNG_UP",
        NOT_CONTACTED: "NOT_CONTACTED",
      };
      const statusUpdate =
        input.callOutcome === "CUSTOM"
          ? {}
          : { status: outcomeToStatus[input.callOutcome] };

      const shouldCountTouch = input.callOutcome !== "NOT_CONTACTED";
      const now = new Date();
      const touchUpdate = shouldCountTouch
        ? {
            touchCount: { increment: 1 },
            lastTouchedAt: now,
          }
        : {};
      const description = `Marked call outcome as ${input.callOutcome.replace(/_/g, " ").toLowerCase()}`;

      const [updated] = await ctx.prisma.$transaction([
        ctx.prisma.lead.update({
          where: { id: input.id, organizationId: ctx.organizationId },
          data: {
            callOutcome: input.callOutcome,
            callNotes: input.callNotes,
            ...statusUpdate,
            ...touchUpdate,
            customOutcomeId: input.callOutcome === "CUSTOM" ? input.customOutcomeId ?? null : null,
          },
        }),
        ctx.prisma.activity.create({
          data: {
            leadId: lead.id,
            userId: ctx.session.user.id,
            type: "CALL_OUTCOME",
            description,
            organizationId: ctx.organizationId,
          },
        }),
      ]);
      await Promise.all([
        invalidate(`dashboard:kpi:${ctx.organizationId}`),
        invalidate(`dashboard:team:${ctx.organizationId}`),
      ]);
      return updated;
    }),

  setDisposition: organizationProcedure
    .input(z.object({ id: z.string(), secondaryOutcomeId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });

      if (input.secondaryOutcomeId) {
        const custom = await ctx.prisma.customOutcome.findFirst({
          where: { id: input.secondaryOutcomeId, organizationId: ctx.organizationId },
          select: { id: true },
        });
        if (!custom) throw new TRPCError({ code: "NOT_FOUND", message: "Custom outcome not found." });
      }

      return ctx.prisma.lead.update({
        where: { id: input.id, organizationId: ctx.organizationId },
        data: { secondaryOutcomeId: input.secondaryOutcomeId },
      });
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
          organizationId: ctx.organizationId,
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
        data: {
          content: input.content,
          leadId: input.leadId,
          userId: ctx.session.user.id,
          organizationId: ctx.organizationId,
        },
      });
      await logActivity(ctx.prisma, {
        leadId: input.leadId,
        userId: ctx.session.user.id,
        type: "NOTE_ADDED",
        description: "Added a note",
        organizationId: ctx.organizationId,
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

  listOrgTags: organizationProcedure.query(({ ctx }) =>
    ctx.prisma.leadTag.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ),

  createTag: organizationProcedure
    .input(z.object({ name: z.string().trim().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.leadTag.count({
        where: { organizationId: ctx.organizationId },
      });
      if (existing >= 100) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 100 tags per organization." });
      }
      const name = input.name.trim();
      const tagKey = name.toLocaleLowerCase();
      return ctx.prisma.leadTag.upsert({
        where: { organizationId_tagKey: { organizationId: ctx.organizationId, tagKey } },
        create: { name, tagKey, organizationId: ctx.organizationId },
        update: {},
        select: { id: true, name: true },
      });
    }),

  deleteTag: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.prisma.leadTag.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found." });
      await ctx.prisma.leadTag.delete({ where: { id: tag.id } });
      return { ok: true };
    }),

  addTagToLead: organizationProcedure
    .input(z.object({ leadId: z.string(), tagId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const [lead, tag] = await Promise.all([
        ctx.prisma.lead.findFirst({
          where: { id: input.leadId, ...leadWhereFromScope(scope) },
          select: { id: true },
        }),
        ctx.prisma.leadTag.findFirst({
          where: { id: input.tagId, organizationId: ctx.organizationId },
          select: { id: true },
        }),
      ]);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found." });

      await ctx.prisma.lead.update({
        where: { id: lead.id },
        data: { tags: { connect: { id: tag.id } } },
      });
      return { ok: true };
    }),

  removeTagFromLead: organizationProcedure
    .input(z.object({ leadId: z.string(), tagId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });

      await ctx.prisma.lead.update({
        where: { id: lead.id },
        data: { tags: { disconnect: { id: input.tagId } } },
      });
      return { ok: true };
    }),

  bulkAddTag: organizationProcedure
    .input(z.object({ leadIds: z.array(z.string()).min(1).max(500), tagId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;
      const uniqueIds = [...new Set(input.leadIds)];

      const tag = await ctx.prisma.leadTag.findFirst({
        where: { id: input.tagId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found." });

      const scope = await getLeadScope(ctx, userId, role);
      const leads = await ctx.prisma.lead.findMany({
        where: { id: { in: uniqueIds }, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (leads.length !== uniqueIds.length) {
        throw new TRPCError({ code: "FORBIDDEN", message: "One or more leads are outside your scope." });
      }

      await ctx.prisma.leadTag.update({
        where: { id: tag.id },
        data: { leads: { connect: uniqueIds.map((id) => ({ id })) } },
      });

      return { count: uniqueIds.length };
    }),

  export: organizationProcedure
    .input(
      z
        .object({
          search: z.string().max(100).optional(),
          status: z
            .enum(["NOT_CONTACTED", "CONNECTED", "AI_VOICEMAIL", "NO_ANSWER", "HUNG_UP"])
            .optional(),
          assignedToId: z.string().optional(),
        })
        .optional()
        .default({}),
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;
      const search = input.search?.trim();

      const baseScope = await getLeadScope(ctx, userId, role);
      const where: Record<string, unknown> = {
        ...leadWhereFromScope(baseScope),
        ...searchWhere(search),
      };

      if (input.status) {
        where.status = input.status;
        where.callOutcome = { not: "CUSTOM" };
      }
      if (input.assignedToId) where.assignedToId = input.assignedToId;

      const leads = await ctx.prisma.lead.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 10_000,
        include: { assignedTo: { select: { name: true, email: true } } },
      });

      const headers = [
        "First Name", "Last Name", "Company", "Email", "Phone",
        "City", "State", "Status", "Call Outcome", "Rating",
        "Review Count", "Source", "Website", "Assigned To", "Created At",
      ];

      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };

      const rows = leads.map((l) =>
        [
          l.firstName, l.lastName, l.company, l.email, l.phone,
          l.city, l.state, l.status, l.callOutcome, l.rating,
          l.reviewCount, l.source, l.website,
          l.assignedTo?.name ?? l.assignedTo?.email ?? "",
          l.createdAt.toISOString(),
        ]
          .map(esc)
          .join(","),
      );

      return { csv: [headers.join(","), ...rows].join("\n"), count: leads.length };
    }),

  bulkSetTemperature: organizationProcedure
    .input(
      z.object({
        leadIds: z.array(z.string()).min(1).max(500),
        temperature: z.enum(["HOT", "WARM", "COOL"]).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;
      const uniqueIds = [...new Set(input.leadIds)];

      const scope = await getLeadScope(ctx, userId, role);
      const leads = await ctx.prisma.lead.findMany({
        where: { id: { in: uniqueIds }, ...leadWhereFromScope(scope) },
        select: { id: true },
      });
      if (leads.length !== uniqueIds.length) {
        throw new TRPCError({ code: "FORBIDDEN", message: "One or more leads are outside your scope." });
      }

      await ctx.prisma.lead.updateMany({
        where: { id: { in: uniqueIds } },
        data: { temperatureOverride: input.temperature as LeadTemperatureOverride | null },
      });

      await ctx.prisma.activity.createMany({
        data: leads.map((l) => ({
          leadId: l.id,
          userId,
          type: "LEAD_TEMPERATURE_OVERRIDE" as const,
          description: input.temperature
            ? `Set temperature to ${input.temperature.toLowerCase()}`
            : "Cleared temperature override",
          organizationId: ctx.organizationId,
        })),
      });

      return { count: leads.length };
    }),

  qualify: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, ...leadWhereFromScope(scope) },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });

      const qualificationSummary = buildQualificationSummary(lead);
      const updated = await ctx.prisma.lead.update({
        where: { id: lead.id },
        data: { qualificationSummary },
        include: includeAssignee,
      });

      await logActivity(ctx.prisma, {
        leadId: lead.id,
        userId: ctx.session.user.id,
        type: "LEAD_QUALIFIED",
        description: "Generated lead qualification summary",
        organizationId: ctx.organizationId,
      });

      return updated;
    }),

  generateQualification: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const scope = await getLeadScope(ctx, ctx.session.user.id, role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, ...leadWhereFromScope(scope) },
        include: includeAssignee,
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });

      const apiKey = process.env.OPENAI_API_KEY;
      let summary: string;

      if (apiKey) {
        const prompt = [
          `Qualify this lead in 2–3 sentences. Be concise and actionable.`,
          `Name: ${[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "(unknown)"}`,
          `Company: ${lead.company ?? "(none)"}`,
          `Location: ${[lead.city, lead.state].filter(Boolean).join(", ") || "(unknown)"}`,
          `Rating: ${lead.rating ?? "N/A"} (${lead.reviewCount ?? 0} reviews)`,
          `Status: ${lead.status} / Outcome: ${lead.callOutcome}`,
          `Source: ${lead.source ?? "unknown"}`,
          `Phone: ${lead.phone ? "Yes" : "No"} · Email: ${lead.email ? "Yes" : "No"}`,
        ].join("\n");

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
            temperature: 0.4,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `OpenAI error: ${text.slice(0, 200)}` });
        }
        const json = await res.json() as { choices: Array<{ message: { content: string } }> };
        summary = json.choices[0]?.message?.content?.trim() ?? "No qualification generated.";
      } else {
        // Heuristic fallback when no OpenAI key is configured
        const parts: string[] = [];
        if (lead.rating && lead.rating >= 4.5 && (lead.reviewCount ?? 0) >= 50)
          parts.push(`Established business with ${lead.rating}★ rating (${lead.reviewCount} reviews).`);
        else if (lead.rating && lead.rating >= 4.0)
          parts.push(`Decent reputation with ${lead.rating}★ rating.`);
        if (lead.phone && lead.email)
          parts.push("Multiple contact channels available (phone + email).");
        else if (lead.phone)
          parts.push("Phone contact available.");
        if (lead.status === "CONNECTED")
          parts.push("Previously connected — warm lead.");
        else if (lead.status === "NOT_CONTACTED")
          parts.push("Not yet contacted — first-touch opportunity.");
        if (parts.length === 0)
          parts.push("Limited data available for qualification. Add more contact info to improve scoring.");
        summary = parts.join(" ");
      }

      const updated = await ctx.prisma.lead.update({
        where: { id: lead.id },
        data: { qualificationSummary: summary },
        include: includeAssignee,
      });

      return { lead: updated, summary };
    }),

  getLeadTags: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const scope = await getLeadScope(ctx, ctx.session.user.id, ctx.session.user.role);
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...leadWhereFromScope(scope) },
        select: { tags: { select: { id: true, name: true } } },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      return lead.tags;
    }),

  customOutcomes: customOutcomesRouter,
});
