import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

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

export const leadsRouter = createTRPCRouter({
  getAll: organizationProcedure
    .input(
      z
        .object({ search: z.string().max(100).optional() })
        .optional()
        .default({})
    )
    .query(({ ctx, input }) => {
      const search = input.search?.trim();
      return ctx.prisma.lead.findMany({
        where: {
          organizationId: ctx.organizationId,
          OR: search
            ? [
                { company: { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ]
            : undefined,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: organizationProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return lead;
    }),

  delete: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return ctx.prisma.lead.delete({ where: { id: input.id } });
    }),

  create: organizationProcedure
    .input(leadInputSchema)
    .mutation(({ ctx, input }) => {
      return ctx.prisma.lead.create({
        data: {
          ...input,
          organizationId: ctx.organizationId,
          assignedToId: ctx.session.user.id,
        },
      });
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
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      return ctx.prisma.lead.update({
        where: { id: input.id },
        data: {
          callOutcome: input.callOutcome,
          callNotes: input.callNotes,
        },
      });
    }),
});
