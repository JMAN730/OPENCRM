import { TRPCError } from "@trpc/server";
import type { OrganizationSubscription, PlanTier, PrismaClient, SubscriptionStatus } from "@prisma/client";
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

export async function getOrgSubscription(
  prisma: PrismaClient,
  organizationId: string,
): Promise<SubscriptionSnapshot | null> {
  return prisma.organizationSubscription.findUnique({
    where: { organizationId },
    select: {
      planTier: true,
      status: true,
      seatLimit: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
    },
  });
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
    const created = await prisma.organizationSubscription.create({
      data: {
        organizationId,
        planTier: "STARTER",
        status: "TRIALING",
        seatLimit: defaultSeatLimitForTier("STARTER"),
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      },
      select: {
        planTier: true,
        status: true,
        seatLimit: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    });
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
