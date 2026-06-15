import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertAdmin } from "@/server/authz";

const personaInput = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  firstMessage: z.string().min(1),
  voiceId: z.string().min(1),
  voiceName: z.string().min(1),
});

export const trainerRouter = createTRPCRouter({
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
});
