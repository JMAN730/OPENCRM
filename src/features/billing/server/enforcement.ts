import { TRPCError } from "@trpc/server";
import type { OrganizationSubscription, PlanTier, PrismaClient, SubscriptionStatus } from "@prisma/client";
import { cached, invalidate } from "@/lib/cache";
import { getPlanLimits, TRIAL_DAYS } from "@/features/billing/server/plans";

export type SubscriptionSnapshot = Pick<
  OrganizationSubscription,
  | "planTier"
  | "status"
  | "seatLimit"
  | "trialEndsAt"
  | "currentPeriodEnd"
  | "cancelAtPeriodEnd"
>;

const SUBSCRIPTION_TTL_SECONDS = 60;

function subscriptionKey(organizationId: string): string {
  return `billing:sub:${organizationId}`;
}

/** Bust the Redis-cached snapshot. Call after any subscription row write. */
export async function invalidateSubscriptionCache(organizationId: string): Promise<void> {
  await invalidate(subscriptionKey(organizationId));
}

/** Dates survive a JSON round-trip through Redis as ISO strings — revive them. */
function reviveSnapshot(sub: SubscriptionSnapshot | null): SubscriptionSnapshot | null {
  if (!sub) return null;
  return {
    ...sub,
    trialEndsAt: sub.trialEndsAt ? new Date(sub.trialEndsAt) : null,
    currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
  };
}

/**
 * Subscription snapshot for enforcement checks. Hot path: the mutation gate in
 * organizationProcedure runs this on every org-scoped mutation, so the row is
 * cached in Redis with a 60s TTL. Webhook and checkout writes call
 * `invalidateSubscriptionCache(organizationId)`.
 */
export async function getOrgSubscription(
  prisma: PrismaClient,
  organizationId: string,
): Promise<SubscriptionSnapshot | null> {
  const snapshot = await cached<SubscriptionSnapshot | null>(
    { key: subscriptionKey(organizationId), ttl: SUBSCRIPTION_TTL_SECONDS },
    () =>
      prisma.organizationSubscription.findUnique({
        where: { organizationId },
        select: {
          planTier: true,
          status: true,
          seatLimit: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      }),
  );
  return reviveSnapshot(snapshot);
}

export function isSubscriptionUsable(
  sub: SubscriptionSnapshot,
  now: Date = new Date(),
): boolean {
  if (sub.status === "ACTIVE") return true;

  if (sub.status === "TRIALING") {
    return !sub.trialEndsAt || sub.trialEndsAt > now;
  }

  return false;
}

export function assertSubscriptionActive(
  sub: SubscriptionSnapshot | null,
  now: Date = new Date(),
): asserts sub is SubscriptionSnapshot {
  if (!sub) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No subscription found for this organization. Contact support or upgrade in Settings → Billing.",
    });
  }

  if (isSubscriptionUsable(sub, now)) return;

  if (sub.status === "TRIALING") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your trial has ended. Upgrade in Settings → Billing to continue.",
    });
  }

  const messages: Partial<Record<SubscriptionStatus, string>> = {
    PAST_DUE: "Your subscription payment is past due. Update billing in Settings → Billing.",
    CANCELED: "Your subscription has been canceled. Resubscribe in Settings → Billing.",
    UNPAID: "Your subscription is unpaid. Update billing in Settings → Billing.",
    NONE: "No active subscription. Upgrade in Settings → Billing.",
  };

  throw new TRPCError({
    code: "FORBIDDEN",
    message: messages[sub.status] ?? "Subscription inactive. Upgrade in Settings → Billing.",
  });
}

export async function assertSubscriptionActiveForOrg(
  prisma: PrismaClient,
  organizationId: string,
): Promise<SubscriptionSnapshot> {
  let sub = await getOrgSubscription(prisma, organizationId);

  if (!sub) {
    // Orgs created before billing shipped have no row yet — start their trial
    // lazily. Upsert so a concurrent mutation (or stale cached null) can't
    // trip the unique constraint on organizationId.
    const created = await prisma.organizationSubscription.upsert({
      where: { organizationId },
      create: {
        organizationId,
        planTier: "STARTER",
        status: "TRIALING",
        seatLimit: defaultSeatLimitForTier("STARTER"),
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      },
      update: {},
      select: {
        planTier: true,
        status: true,
        seatLimit: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    });
    await invalidateSubscriptionCache(organizationId);
    sub = created;
  }

  assertSubscriptionActive(sub);
  return sub;
}

export function assertSeatAvailable(sub: SubscriptionSnapshot, seatsUsed: number): void {
  if (seatsUsed < sub.seatLimit) return;

  throw new TRPCError({
    code: "FORBIDDEN",
    message: `Seat limit reached (${sub.seatLimit}). Upgrade your plan in Settings → Billing to invite more members.`,
  });
}

export function getEffectivePlanLimits(sub: SubscriptionSnapshot): ReturnType<typeof getPlanLimits> {
  return getPlanLimits(sub.planTier);
}

export function assertTagLimit(sub: SubscriptionSnapshot, currentTagCount: number): void {
  const { maxTags } = getEffectivePlanLimits(sub);
  if (currentTagCount < maxTags) return;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Maximum ${maxTags} tags per organization on your ${sub.planTier} plan. Upgrade in Settings → Billing.`,
  });
}

export function clampScraperInput(
  sub: SubscriptionSnapshot,
  input: { locations: string[]; limit: number },
): { locations: string[]; limit: number } {
  const { maxScraperLocations, maxScraperRecords } = getEffectivePlanLimits(sub);

  if (input.locations.length > maxScraperLocations) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Your plan allows up to ${maxScraperLocations} locations per scraper job. Upgrade in Settings → Billing.`,
    });
  }

  if (input.limit > maxScraperRecords) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Your plan allows up to ${maxScraperRecords} records per scraper job. Upgrade in Settings → Billing.`,
    });
  }

  return input;
}

export function defaultSeatLimitForTier(tier: PlanTier): number {
  return getPlanLimits(tier).seatLimit;
}
