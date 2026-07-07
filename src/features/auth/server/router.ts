import crypto from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "@/server/trpc";
import { sendPasswordResetEmail } from "@/lib/email";
import { assertWithinRateLimit, getClientIp } from "@/lib/rateLimit";
import { invalidateAuthSnapshot } from "@/lib/auth";
import { createStripeCustomer } from "@/features/billing/server/stripe";
import { TRIAL_DAYS } from "@/features/billing/server/plans";
import { defaultSeatLimitForTier } from "@/features/billing/server/enforcement";
import { keys } from "@/lib/cacheKeys";

const loadingAnimationModeSchema = z.enum(["ALWAYS", "ONCE_DAILY", "OFF"]);

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export const authRouter = createTRPCRouter({
  resetPassword: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const ip = getClientIp(ctx.headers);

      // Two-tier rate limit: protect the user from spam reset emails AND
      // protect the system from anyone iterating addresses.
      await assertWithinRateLimit({
        key: keys.authResetEmailBucket(email),
        limit: 3,
        windowSeconds: 60 * 60,
      });
      await assertWithinRateLimit({
        key: keys.authResetIpBucket(ip),
        limit: 10,
        windowSeconds: 60 * 60,
      });

      const user = await ctx.prisma.user.findUnique({ where: { email } });

      if (user?.email) {
        await ctx.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

        const raw = crypto.randomBytes(32).toString("base64url");
        const tokenHash = hashToken(raw);
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await ctx.prisma.passwordResetToken.create({
          data: { tokenHash, userId: user.id, expires },
        });

        const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${raw}`;
        await sendPasswordResetEmail(user.email, resetUrl);
      }

      // Always return success to prevent email enumeration
      return { success: true };
    }),

  confirmResetPassword: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      password: z.string().min(8).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const ip = getClientIp(ctx.headers);
      await assertWithinRateLimit({
        key: keys.authResetConfirmIpBucket(ip),
        limit: 20,
        windowSeconds: 60 * 60,
      });

      const tokenHash = hashToken(input.token);
      const resetToken = await ctx.prisma.passwordResetToken.findUnique({
        where: { tokenHash },
      });

      if (!resetToken || resetToken.expires < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This reset link is invalid or has expired.",
        });
      }

      const hashed = await bcrypt.hash(input.password, 12);

      // Atomically update password and consume the token so a leaked link
      // can't be replayed even if the email is read multiple times.
      await ctx.prisma.$transaction([
        ctx.prisma.user.update({
          where: { id: resetToken.userId },
          // Bump sessionVersion so any JWT minted before this reset is
          // rejected on its next refresh (CWE-613 session revocation).
          data: { password: hashed, sessionVersion: { increment: 1 } },
        }),
        ctx.prisma.passwordResetToken.delete({ where: { tokenHash } }),
      ]);

      // Force the auth snapshot cache to refresh on next request so a
      // freshly-set password takes effect immediately.
      await invalidateAuthSnapshot(resetToken.userId);

      return { ok: true };
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
      const ip = getClientIp(ctx.headers);
      await assertWithinRateLimit({
        key: keys.authRegisterIpBucket(ip),
        limit: 10,
        windowSeconds: 60 * 60,
      });

      const email = input.email.toLowerCase().trim();

      const existing = await ctx.prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with that email already exists.",
        });
      }

      const hashed = await bcrypt.hash(input.password, 12);
      const orgName =
        input.organizationName?.trim() || `${input.name}'s Organization`;
      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

      const organization = await ctx.prisma.organization.create({
        data: {
          name: orgName,
          subscription: {
            create: {
              planTier: "STARTER",
              status: "TRIALING",
              seatLimit: defaultSeatLimitForTier("STARTER"),
              trialEndsAt,
            },
          },
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

      try {
        const customerId = await createStripeCustomer({
          organizationId: organization.id,
          organizationName: orgName,
          email,
        });
        if (customerId) {
          await ctx.prisma.organizationSubscription.update({
            where: { organizationId: organization.id },
            data: { stripeCustomerId: customerId },
          });
        }
      } catch (err) {
        console.error("[auth.register] Stripe customer creation failed", err);
      }

      return { ok: true };
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255).optional(),
        email: z.string().email().max(255).optional(),
        currentPassword: z.string().optional(),
        loadingAnimationMode: loadingAnimationModeSchema.optional(),
      })
      .refine(
        (d) => d.name !== undefined || d.email !== undefined || d.loadingAnimationMode !== undefined,
        { message: "At least one field must be provided" }
      )
      .superRefine((d, ctx) => {
        if (d.email !== undefined && !d.currentPassword) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Current password is required to change your email.",
            path: ["currentPassword"],
          });
        }
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (input.email) {
        // Verify current password before allowing email change
        const user = await ctx.prisma.user.findUnique({
          where: { id: userId },
          select: { password: true },
        });
        if (!user?.password || !input.currentPassword) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot verify identity — password required.",
          });
        }
        const passwordMatches = await bcrypt.compare(input.currentPassword, user.password);
        if (!passwordMatches) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Current password is incorrect." });
        }

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
          ...(input.loadingAnimationMode !== undefined && { loadingAnimationMode: input.loadingAnimationMode }),
          // An email change is a credential change — revoke existing sessions
          // by bumping sessionVersion (CWE-613).
          ...(input.email !== undefined && { sessionVersion: { increment: 1 } }),
        },
      });

      await invalidateAuthSnapshot(userId);

      return { ok: true };
    }),

  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const user = await ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, organizationId: true },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });

    // If the caller is the sole ADMIN of an org that still has other users,
    // refuse — otherwise the remaining members become orphaned with no one
    // who can re-invite, change roles, or manage teams.
    if (user.organizationId && user.role === "ADMIN") {
      const [otherAdmins, otherMembers] = await Promise.all([
        ctx.prisma.user.count({
          where: {
            organizationId: user.organizationId,
            role: "ADMIN",
            NOT: { id: userId },
          },
        }),
        ctx.prisma.user.count({
          where: {
            organizationId: user.organizationId,
            NOT: { id: userId },
          },
        }),
      ]);
      if (otherAdmins === 0 && otherMembers > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "You're the last admin in this organization. Promote another member to admin before deleting your account.",
        });
      }
    }

    // ScraperJob.userId is required with no cascade, must be deleted first
    await ctx.prisma.scraperJob.deleteMany({ where: { userId } });
    await ctx.prisma.user.delete({ where: { id: userId } });

    // Drop the cache immediately so this user's JWT can't ride for up to 60s.
    await invalidateAuthSnapshot(userId);

    return { ok: true };
  }),
});
