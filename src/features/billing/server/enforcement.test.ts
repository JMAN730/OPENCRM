import { describe, expect, it } from "vitest";
import {
  assertSeatAvailable,
  assertSubscriptionActive,
  assertTagLimit,
  clampScraperInput,
  isSubscriptionUsable,
} from "@/features/billing/server/enforcement";

const activeSub = {
  planTier: "PRO" as const,
  status: "ACTIVE" as const,
  seatLimit: 10,
  trialEndsAt: null,
  currentPeriodEnd: new Date("2030-01-01"),
  cancelAtPeriodEnd: false,
};

const trialingSub = {
  planTier: "STARTER" as const,
  status: "TRIALING" as const,
  seatLimit: 3,
  trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

describe("billing enforcement", () => {
  it("treats active and in-trial subscriptions as usable", () => {
    expect(isSubscriptionUsable(activeSub)).toBe(true);
    expect(isSubscriptionUsable(trialingSub)).toBe(true);
  });

  it("blocks expired trials and past-due subscriptions", () => {
    expect(
      isSubscriptionUsable({
        ...trialingSub,
        trialEndsAt: new Date(Date.now() - 1000),
      }),
    ).toBe(false);

    expect(isSubscriptionUsable({ ...activeSub, status: "PAST_DUE" })).toBe(false);
  });

  it("assertSubscriptionActive throws for missing subscription", () => {
    expect(() => assertSubscriptionActive(null)).toThrow(/No subscription found/);
  });

  it("assertSeatAvailable allows invites below the limit", () => {
    expect(() => assertSeatAvailable(activeSub, 9)).not.toThrow();
    expect(() => assertSeatAvailable(activeSub, 10)).toThrow(/Seat limit reached/);
  });

  it("assertTagLimit enforces plan-specific tag caps", () => {
    expect(() => assertTagLimit(trialingSub, 24)).not.toThrow();
    expect(() => assertTagLimit(trialingSub, 25)).toThrow(/Maximum 25 tags/);
  });

  it("clampScraperInput enforces scraper caps", () => {
    expect(() =>
      clampScraperInput(trialingSub, {
        locations: Array.from({ length: 11 }, (_, i) => `City ${i}`),
        limit: 10,
      }),
    ).toThrow(/up to 10 locations/);

    expect(() =>
      clampScraperInput(trialingSub, {
        locations: ["Toledo, OH"],
        limit: 51,
      }),
    ).toThrow(/up to 50 records/);
  });
});
