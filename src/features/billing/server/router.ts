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
import {
  defaultSeatLimitForTier,
  invalidateSubscriptionCache,
} from "@/features/billing/server/enforcement";
import { appBaseUrl } from "@/lib/appUrl";

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
        seatLimit: limits.seatLimit,
        seatsUsed,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        hasStripeSubscription: false,
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
      hasStripeSubscription:
        Boolean(subscription.stripeSubscriptionId) && subscription.status !== "CANCELED",
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
      const baseUrl = appBaseUrl("http://localhost:3000");

      let subscription = await ctx.prisma.organizationSubscription.findUnique({
        where: { organizationId: ctx.organizationId },
      });

      // A checkout session would create a second Stripe subscription and
      // double-bill the org. Plan changes for subscribed orgs go through the
      // Stripe billing portal instead.
      if (subscription?.stripeSubscriptionId && subscription.status !== "CANCELED") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This organization already has a subscription. Use “Manage billing” to change plans.",
        });
      }

      if (!subscription) {
        // Placeholder row at Starter limits only — the selected tier's plan
        // and seats are applied by the webhook after payment succeeds, so an
        // abandoned checkout can't leave the org trialing on paid-tier limits.
        subscription = await ctx.prisma.organizationSubscription.create({
          data: {
            organizationId: ctx.organizationId,
            planTier: "STARTER",
            status: "TRIALING",
            seatLimit: defaultSeatLimitForTier("STARTER"),
            trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
          },
        });
        await invalidateSubscriptionCache(ctx.organizationId);
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
            // Seat count for the plan being purchased — the webhook derives
            // the org's seatLimit from this quantity, so using the current
            // (e.g. trial) seatLimit here would understate the new plan.
            price: priceId,
            quantity: defaultSeatLimitForTier(input.planTier),
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
    const baseUrl = appBaseUrl("http://localhost:3000");

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${baseUrl}/settings?tab=Billing`,
    });

    return { url: session.url };
  }),
});
