import { describe, expect, it } from "vitest";
import { effectiveTempOf, reviewSummary, scoreOf, type Lead } from "./shared";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    status: "NOT_CONTACTED",
    callOutcome: "NOT_CONTACTED",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("lead score helpers", () => {
  it("uses reviews as a base score component", () => {
    const low = scoreOf(makeLead({ rating: 3.2, reviewCount: 4 }));
    const high = scoreOf(makeLead({ rating: 4.8, reviewCount: 220 }));

    expect(high).toBeGreaterThan(low);
  });

  it("applies manual temperature override without changing numeric score", () => {
    const lead = makeLead({
      rating: 4.2,
      reviewCount: 20,
      temperatureOverride: "HOT",
    });

    expect(scoreOf(lead)).toBeLessThan(70);
    expect(effectiveTempOf(lead)).toBe("hot");
  });

  it("formats review summary text", () => {
    expect(reviewSummary(makeLead({ rating: 4.6, reviewCount: 128 }))).toBe("4.6 ★ (128 reviews)");
  });
});
