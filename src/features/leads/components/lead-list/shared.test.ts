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

  it("formats review summary text", () => {
    expect(reviewSummary(makeLead({ rating: 4.6, reviewCount: 128 }))).toBe("4.6 ★ (128 reviews)");
  });
});

describe("effectiveTempOf", () => {
  it("returns cool for a new lead with no contact", () => {
    expect(effectiveTempOf(makeLead())).toBe("cool");
  });

  it("returns warm automatically when the lead is connected", () => {
    expect(effectiveTempOf(makeLead({ status: "CONNECTED" }))).toBe("warm");
  });

  it("returns cool for non-connected statuses", () => {
    expect(effectiveTempOf(makeLead({ status: "NO_ANSWER" }))).toBe("cool");
    expect(effectiveTempOf(makeLead({ status: "AI_VOICEMAIL" }))).toBe("cool");
    expect(effectiveTempOf(makeLead({ status: "HUNG_UP" }))).toBe("cool");
  });

  it("returns hot when manually overridden regardless of status", () => {
    expect(effectiveTempOf(makeLead({ status: "NOT_CONTACTED", temperatureOverride: "HOT" }))).toBe("hot");
    expect(effectiveTempOf(makeLead({ status: "CONNECTED", temperatureOverride: "HOT" }))).toBe("hot");
  });

  it("ignores WARM/COOL overrides and falls back to status-based logic", () => {
    expect(effectiveTempOf(makeLead({ status: "NOT_CONTACTED", temperatureOverride: "WARM" }))).toBe("cool");
    expect(effectiveTempOf(makeLead({ status: "CONNECTED", temperatureOverride: "COOL" }))).toBe("warm");
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

  it("uses persisted touchCount when call outcomes are logged", () => {
    expect(
      touchesOf(
        makeLead({
          status: "CONNECTED",
          callOutcome: "ANSWERED",
          touchCount: 1,
          _count: { calls: 0, notes: 0 },
        }),
      ),
    ).toBe(1);
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
