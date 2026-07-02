import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { assertAdmin } from "@/server/authz";
import {
  formatPlanTier,
  getPlanLimits,
  getStripePriceId,
  PLAN_TIERS,
  TRIAL_DAYS,
} from "@/features/billing/server/plans";
import { createStripeCustomer, isStripeConfigured, requireStripe } from "@/features/billing/server/stripe";

const planTierSchema = z.enum(["STARTER", "PRO", "BUSINESS"]);

export const billingRouter = createTRPCRouter({
  getSubscription: organizationProcedure.query(async ({ ctx }) => {
    const [subscription, users, pendingInvites] = await Promise.all([
      ctx.prisma.organizationSubscription.findUnique({
        where: { organizationId: ctx.organizationId },
      }),
      ctx.prisma.user.count({ where: { organizationId: ctx.organizationId } }),
      ctx.prisma.invitation.count({
        where: { organizationId: ctx.organizationId, status: "PENDING" },
      }),
    ]);

    const seatsUsed = users + pendingInvites;

    if (!subscription) {
      const limits = getPlanLimits("STARTER");
      return {
        configured: isStripeConfigured(),
        planTier: "STARTER" as const,
        planLabel: formatPlanTier("STARTER"),
        status: "NONE" as const,
        seatLimit: 3,
        seatsUsed,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        limits,
        availableTiers: PLAN_TIERS.map((tier) => ({
          tier,
          label: formatPlanTier(tier),
          priceConfigured: Boolean(getStripePriceId(tier)),
        })),
      };
    }

    return {
      configured: isStripeConfigured(),
      planTier: subscription.planTier,
      planLabel: formatPlanTier(subscription.planTier),
      status: subscription.status,
      seatLimit: subscription.seatLimit,
      seatsUsed,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      limits: getPlanLimits(subscription.planTier),
      availableTiers: PLAN_TIERS.map((tier) => ({
        tier,
        label: formatPlanTier(tier),
        priceConfigured: Boolean(getStripePriceId(tier)),
      })),
    };
  }),

  createCheckoutSession: organizationProcedure
    .input(z.object({ planTier: planTierSchema }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session.user.role);

      if (!isStripeConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Billing is not configured on this server.",
        });
      }

      const priceId = getStripePriceId(input.planTier);
      if (!priceId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Stripe price is not configured for the ${formatPlanTier(input.planTier)} plan.`,
        });
      }

      const stripe = requireStripe();
      const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      let subscription = await ctx.prisma.organizationSubscription.findUnique({
        where: { organizationId: ctx.organizationId },
      });

      if (!subscription) {
        subscription = await ctx.prisma.organizationSubscription.create({
          data: {
            organizationId: ctx.organizationId,
            planTier: input.planTier,
            status: "TRIALING",
            seatLimit: 3,
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
          },
        });
      }

      let customerId = subscription.stripeCustomerId;
      if (!customerId) {
        const admin = await ctx.prisma.user.findFirst({
          where: { organizationId: ctx.organizationId, role: "ADMIN" },
          select: { email: true, name: true },
        });
        const org = await ctx.prisma.organization.findUnique({
          where: { id: ctx.organizationId },
          select: { name: true },
        });

        customerId = await createStripeCustomer({
          organizationId: ctx.organizationId,
          organizationName: org?.name ?? "Organization",
          email: admin?.email ?? ctx.session.user.email ?? "billing@example.com",
        });

        if (customerId) {
          await ctx.prisma.organizationSubscription.update({
            where: { organizationId: ctx.organizationId },
            data: { stripeCustomerId: customerId },
          });
        }
      }

      if (!customerId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create Stripe customer.",
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: subscription.seatLimit,
          },
        ],
        success_url: `${baseUrl}/settings?tab=Billing&checkout=success`,
        cancel_url: `${baseUrl}/settings?tab=Billing&checkout=canceled`,
        metadata: { organizationId: ctx.organizationId },
        subscription_data: {
          metadata: { organizationId: ctx.organizationId },
        },
      });

      if (!session.url) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe did not return a checkout URL.",
        });
      }

      return { url: session.url };
    }),

  createPortalSession: organizationProcedure.mutation(async ({ ctx }) => {
    assertAdmin(ctx.session.user.role);

    if (!isStripeConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Billing is not configured on this server.",
      });
    }

    const subscription = await ctx.prisma.organizationSubscription.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { stripeCustomerId: true },
    });

    if (!subscription?.stripeCustomerId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No billing account found. Start a subscription first.",
      });
    }

    const stripe = requireStripe();
    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${baseUrl}/settings?tab=Billing`,
    });

    return { url: session.url };
  }),
});
