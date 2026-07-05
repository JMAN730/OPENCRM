import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { assertAdmin, isManagerOrAdmin } from "@/server/authz";
import { assertWithinRateLimit } from "@/lib/rateLimit";
import { getLeadScope, scopedLeadWhere } from "@/server/teams/scope";
import { buildLeadContext, interpolate } from "../leadContext";
import { scoreCall } from "./scoring";

const personaInput = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  firstMessage: z.string().min(1),
  voiceId: z.string().min(1),
  voiceName: z.string().min(1),
});

export const trainerRouter = createTRPCRouter({
  config: organizationProcedure.query(() => ({
    voiceConfigured: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID),
  })),

  listPersonas: organizationProcedure.query(({ ctx }) =>
    ctx.prisma.trainingPersona.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "asc" },
    }),
  ),

  createPersona: organizationProcedure
    .input(personaInput)
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session.user.role);
      return ctx.prisma.trainingPersona.create({
        data: { ...input, organizationId: ctx.organizationId },
      });
    }),

  updatePersona: organizationProcedure
    .input(personaInput.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session.user.role);
      const existing = await ctx.prisma.trainingPersona.findUnique({
        where: { id: input.id },
        select: { organizationId: true },
      });
      if (!existing || existing.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found." });
      }
      const { id, ...data } = input;
      return ctx.prisma.trainingPersona.update({ where: { id }, data });
    }),

  deletePersona: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session.user.role);
      const existing = await ctx.prisma.trainingPersona.findUnique({
        where: { id: input.id },
        select: { organizationId: true },
      });
      if (!existing || existing.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found." });
      }
      await ctx.prisma.trainingPersona.delete({ where: { id: input.id } });
      return { success: true };
    }),

  startSession: organizationProcedure
    .input(z.object({ leadId: z.string(), personaId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { organizationId: true, assignedToId: true, company: true, firstName: true, lastName: true, source: true },
      });
      if (!lead || lead.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }
      const scope = await getLeadScope(ctx);
      if (scope.kind === "users" && (!lead.assignedToId || !scope.userIds.includes(lead.assignedToId))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }

      const persona = await ctx.prisma.trainingPersona.findUnique({
        where: { id: input.personaId },
        select: { organizationId: true, systemPrompt: true, firstMessage: true, voiceId: true },
      });
      if (!persona || persona.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found." });
      }

      const apiKey = process.env.ELEVENLABS_API_KEY;
      const agentId = process.env.ELEVENLABS_AGENT_ID;
      if (!apiKey || !agentId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Voice trainer is not configured." });
      }

      const leadCtx = buildLeadContext(lead);
      const systemPrompt = interpolate(persona.systemPrompt, leadCtx);
      const firstMessage = interpolate(persona.firstMessage, leadCtx);

      const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
        { headers: { "xi-api-key": apiKey }, cache: "no-store" },
      );
      if (!res.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to start voice session." });
      }
      const { signed_url } = (await res.json()) as { signed_url: string };

      return {
        signedUrl: signed_url,
        overrides: {
          agent: { prompt: { prompt: systemPrompt }, firstMessage, language: "en" },
          tts: { voiceId: persona.voiceId },
        },
      };
    }),

  scoreSession: organizationProcedure
    .input(z.object({
      leadId: z.string(),
      personaId: z.string().nullable().optional(),
      transcript: z.array(z.object({
        role: z.enum(["user", "agent"]),
        text: z.string(),
        at: z.number(),
      })),
      durationSeconds: z.number().int().nonnegative().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { organizationId: true, assignedToId: true, company: true, firstName: true, lastName: true, source: true },
      });
      if (!lead || lead.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }
      const scope = await getLeadScope(ctx);
      if (scope.kind === "users" && (!lead.assignedToId || !scope.userIds.includes(lead.assignedToId))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }

      let personaName = "Prospect";
      if (input.personaId) {
        const persona = await ctx.prisma.trainingPersona.findUnique({
          where: { id: input.personaId },
          select: { organizationId: true, name: true },
        });
        if (!persona || persona.organizationId !== ctx.organizationId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found." });
        }
        personaName = persona.name;
      }

      await assertWithinRateLimit({
        key: `trainer:score:${ctx.session.user.id}`,
        limit: 20,
        windowSeconds: 60,
        message: "Too many scoring requests. Try again shortly.",
      });

      const leadName = buildLeadContext(lead).leadName;
      const scorecard = await scoreCall({ transcript: input.transcript, personaName, leadName });

      const session = await ctx.prisma.trainingSession.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.session.user.id,
          leadId: input.leadId,
          personaId: input.personaId ?? null,
          transcript: input.transcript as unknown as Prisma.InputJsonValue,
          scorecard: (scorecard ?? undefined) as Prisma.InputJsonValue | undefined,
          durationSeconds: input.durationSeconds,
        },
      });

      return { sessionId: session.id, scorecard };
    }),

  getSessions: organizationProcedure.query(({ ctx }) => {
    const where = isManagerOrAdmin(ctx.session.user.role)
      ? { organizationId: ctx.organizationId }
      : { organizationId: ctx.organizationId, userId: ctx.session.user.id };
    return ctx.prisma.trainingSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        persona: { select: { name: true } },
        lead: { select: { firstName: true, lastName: true, company: true } },
        user: { select: { name: true } },
      },
    });
  }),

  pickableLeads: organizationProcedure.query(async ({ ctx }) => {
    const where = await scopedLeadWhere(ctx);
    return ctx.prisma.lead.findMany({
      where,
      orderBy: [{ company: "asc" }, { createdAt: "desc" }],
      take: 100,
      select: { id: true, firstName: true, lastName: true, company: true, source: true },
    });
  }),
});
