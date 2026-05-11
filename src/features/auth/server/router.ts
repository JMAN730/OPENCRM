import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/server/trpc";

export const authRouter = createTRPCRouter({
  // Stub — email-based reset is not yet implemented. Returns success so the UI
  // can show a confirmation without exposing account existence or resetting passwords.
  resetPassword: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async () => {
      return { success: true };
    }),

  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        email: z.string().email().max(255),
        password: z.string().min(8).max(255),
        organizationName: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();

      const existing = await ctx.prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with that email already exists.",
        });
      }

      const hashed = await bcrypt.hash(input.password, 12);

      const organization = await ctx.prisma.organization.create({
        data: {
          name:
            input.organizationName?.trim() || `${input.name}'s Organization`,
        },
      });

      await ctx.prisma.user.create({
        data: {
          name: input.name,
          email,
          password: hashed,
          organizationId: organization.id,
          role: "ADMIN",
        },
      });

      return { ok: true };
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255).optional(),
        email: z.string().email().max(255).optional(),
      }).refine((d) => d.name !== undefined || d.email !== undefined, {
        message: "At least one field must be provided",
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (input.email) {
        const email = input.email.toLowerCase().trim();
        const existing = await ctx.prisma.user.findFirst({
          where: { email, NOT: { id: userId } },
        });
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists." });
        }
        input.email = email;
      }

      await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined && { name: input.name.trim() }),
          ...(input.email !== undefined && { email: input.email }),
        },
      });

      return { ok: true };
    }),

  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // ScraperJob.userId is required with no cascade, must be deleted first
    await ctx.prisma.scraperJob.deleteMany({ where: { userId } });
    await ctx.prisma.user.delete({ where: { id: userId } });

    return { ok: true };
  }),
});
