import type { PrismaClient, SubscriptionStatus, PlanTier } from "@prisma/client";
import type Stripe from "stripe";
import {
  planTierFromPriceId,
} from "@/features/billing/server/plans";
import {
  defaultSeatLimitForTier,
  invalidateSubscriptionCache,
} from "@/features/billing/server/enforcement";
import { isUniqueConstraintError } from "@/lib/prismaErrors";

function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items.data[0];
  if (!item?.current_period_end) return null;
  return new Date(item.current_period_end * 1000);
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSub = invoice.parent?.subscription_details?.subscription;
  if (typeof parentSub === "string") return parentSub;
  if (parentSub && typeof parentSub === "object" && "id" in parentSub) {
    return parentSub.id;
  }
  return null;
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    // incomplete_expired is terminal — Stripe generates no further invoices
    // and sends no deleted event, so treat it as canceled or the checkout
    // guard would lock the org out of ever starting a fresh subscription.
    case "incomplete_expired":
      return "CANCELED";
    case "unpaid":
    case "incomplete":
    case "paused":
      return "UNPAID";
    default:
      return "NONE";
  }
}

function primarySubscriptionItem(subscription: Stripe.Subscription) {
  return subscription.items.data[0] ?? null;
}

function tierFromSubscription(subscription: Stripe.Subscription): PlanTier {
  const item = primarySubscriptionItem(subscription);
  const priceId = item?.price?.id;
  if (priceId) {
    const tier = planTierFromPriceId(priceId);
    if (tier) return tier;
  }
  return "STARTER";
}

function seatLimitFromSubscription(subscription: Stripe.Subscription, tier: PlanTier): number {
  const item = primarySubscriptionItem(subscription);
  const quantity = item?.quantity ?? defaultSeatLimitForTier(tier);
  return Math.max(1, quantity);
}

export async function syncSubscriptionFromStripe(
  prisma: PrismaClient,
  subscription: Stripe.Subscription,
  organizationId?: string,
): Promise<void> {
  const orgId =
    organizationId ??
    (typeof subscription.metadata?.organizationId === "string"
      ? subscription.metadata.organizationId
      : undefined);

  if (!orgId) {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;

    if (customerId) {
      const byCustomer = await prisma.organizationSubscription.findFirst({
        where: { stripeCustomerId: customerId },
        select: { organizationId: true },
      });
      if (!byCustomer) return;
      return syncSubscriptionFromStripe(prisma, subscription, byCustomer.organizationId);
    }
    return;
  }

  const tier = tierFromSubscription(subscription);
  const seatLimit = seatLimitFromSubscription(subscription, tier);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  await prisma.organizationSubscription.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      planTier: tier,
      status: mapStripeStatus(subscription.status),
      seatLimit,
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    update: {
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: subscription.id,
      planTier: tier,
      status: mapStripeStatus(subscription.status),
      seatLimit,
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
  await invalidateSubscriptionCache(orgId);
}

export async function handleCheckoutSessionCompleted(
  prisma: PrismaClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const organizationId = session.metadata?.organizationId;
  if (!organizationId) return;

  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (customerId) {
    await prisma.organizationSubscription.updateMany({
      where: { organizationId },
      data: { stripeCustomerId: customerId },
    });
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) return;

  // Subscription details are synced via customer.subscription.* webhook events.
  // Link the subscription id early so getSubscription can find it.
  await prisma.organizationSubscription.updateMany({
    where: { organizationId },
    data: { stripeSubscriptionId: subscriptionId },
  });
}

async function setStatusForStripeSubscription(
  prisma: PrismaClient,
  stripeSubscriptionId: string,
  status: SubscriptionStatus,
): Promise<void> {
  const row = await prisma.organizationSubscription.findFirst({
    where: { stripeSubscriptionId },
    select: { organizationId: true },
  });
  if (!row) return;

  await prisma.organizationSubscription.updateMany({
    where: { stripeSubscriptionId },
    data: { status },
  });
  await invalidateSubscriptionCache(row.organizationId);
}

export async function markSubscriptionPastDue(
  prisma: PrismaClient,
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  await setStatusForStripeSubscription(prisma, subscriptionId, "PAST_DUE");
}

export async function markSubscriptionActiveFromInvoice(
  prisma: PrismaClient,
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  await setStatusForStripeSubscription(prisma, subscriptionId, "ACTIVE");
}

export async function markSubscriptionCanceled(
  prisma: PrismaClient,
  subscription: Stripe.Subscription,
): Promise<void> {
  // Match on the Stripe subscription id, never the org id: a late-arriving
  // deleted event for an org's previous subscription must not cancel the
  // subscription that replaced it. If the id no longer matches the org's row,
  // this event is about a superseded subscription and is safely a no-op.
  const row = await prisma.organizationSubscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { organizationId: true },
  });
  if (!row) return;

  await prisma.organizationSubscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: "CANCELED",
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: subscription.ended_at
        ? new Date(subscription.ended_at * 1000)
        : null,
    },
  });
  await invalidateSubscriptionCache(row.organizationId);
}

export async function processStripeWebhookEvent(
  prisma: PrismaClient,
  event: Stripe.Event,
): Promise<void> {
  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { eventId: event.id },
    select: { id: true },
  });
  if (existing) return;

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(
        prisma,
        event.data.object as Stripe.Checkout.Session,
      );
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscriptionFromStripe(
        prisma,
        event.data.object as Stripe.Subscription,
      );
      break;
    case "customer.subscription.deleted":
      await markSubscriptionCanceled(
        prisma,
        event.data.object as Stripe.Subscription,
      );
      break;
    case "invoice.payment_failed":
      await markSubscriptionPastDue(prisma, event.data.object as Stripe.Invoice);
      break;
    case "invoice.paid":
      await markSubscriptionActiveFromInvoice(
        prisma,
        event.data.object as Stripe.Invoice,
      );
      break;
    default:
      break;
  }

  // Concurrent Stripe retries of the same event can race past the findUnique
  // check above; the handlers are idempotent, so swallow the duplicate-key
  // error instead of returning a 500 (which would trigger another retry).
  await prisma.stripeWebhookEvent
    .create({ data: { eventId: event.id, type: event.type } })
    .catch((err: unknown) => {
      if (isUniqueConstraintError(err)) return;
      throw err;
    });
}
