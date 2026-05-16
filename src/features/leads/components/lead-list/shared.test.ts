import { describe, expect, it } from "vitest";
import { effectiveTempOf, reviewSummary, scoreOf, touchesOf, type Lead } from "./shared";

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

describe("touchesOf", () => {
  it("returns 0 for a lead with no recorded calls or notes", () => {
    expect(touchesOf(makeLead())).toBe(0);
  });

  it("reflects exactly one touch for a lead with one logged call", () => {
    // A lead that has been called once must surface as 1 — the previous
    // heuristic returned 5 here based on call outcome, which is the bug.
    expect(
      touchesOf(
        makeLead({
          status: "CONNECTED",
          callOutcome: "ANSWERED",
          _count: { calls: 1, notes: 0 },
        }),
      ),
    ).toBe(1);
  });

  it("does not inflate touches from call outcome alone", () => {
    // No CallLog rows recorded yet -> touches must be 0 regardless of
    // status or denormalized callOutcome. This protects against seed
    // data / status changes being counted as touches.
    expect(
      touchesOf(
        makeLead({
          status: "CONNECTED",
          callOutcome: "ANSWERED",
          _count: { calls: 0, notes: 0 },
        }),
      ),
    ).toBe(0);
  });

  it("counts calls and notes additively", () => {
    expect(
      touchesOf(
        makeLead({
          _count: { calls: 2, notes: 3 },
        }),
      ),
    ).toBe(5);
  });
});
