import type { PlanTier } from "@prisma/client";

export type PlanLimits = {
  seatLimit: number;
  maxTags: number;
  maxScraperLocations: number;
  maxScraperRecords: number;
};

export const TRIAL_DAYS = 14;

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  STARTER: {
    seatLimit: 3,
    maxTags: 25,
    maxScraperLocations: 10,
    maxScraperRecords: 50,
  },
  PRO: {
    seatLimit: 10,
    maxTags: 100,
    maxScraperLocations: 50,
    maxScraperRecords: 200,
  },
  BUSINESS: {
    seatLimit: 50,
    maxTags: 500,
    maxScraperLocations: 50,
    maxScraperRecords: 200,
  },
};

export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLAN_LIMITS[tier];
}

export function getStripePriceId(tier: PlanTier): string | undefined {
  const envKey =
    tier === "STARTER"
      ? "STRIPE_PRICE_STARTER"
      : tier === "PRO"
        ? "STRIPE_PRICE_PRO"
        : "STRIPE_PRICE_BUSINESS";
  return process.env[envKey]?.trim() || undefined;
}

export function planTierFromPriceId(priceId: string): PlanTier | null {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "STARTER";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "PRO";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return "BUSINESS";
  return null;
}

export const PLAN_TIERS: PlanTier[] = ["STARTER", "PRO", "BUSINESS"];

export function formatPlanTier(tier: PlanTier): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}
