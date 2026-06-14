import { describe, it, expect } from "vitest";
import { matchHint } from "./hints";

describe("matchHint", () => {
  it("returns the price-objection hint when price is mentioned", () => {
    expect(matchHint("Honestly your price is too expensive")).toMatch(/ROI/);
  });
  it("returns the not-interested hint", () => {
    expect(matchHint("I'm really not interested")).toMatch(/open question/i);
  });
  it("returns null when nothing matches", () => {
    expect(matchHint("Sure, tell me more about that")).toBeNull();
  });
  it("is case-insensitive", () => {
    expect(matchHint("SEND ME AN EMAIL")).toMatch(/value statement/i);
  });
});
