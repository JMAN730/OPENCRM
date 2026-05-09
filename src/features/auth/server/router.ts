import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "@/server/trpc";

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
});
