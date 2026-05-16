import { describe, expect, it } from "vitest";

import { parseCityState, parseLocationSearch } from "@/features/leads/location";

describe("parseCityState", () => {
  it("parses city and full state name", () => {
    expect(parseCityState("Tampa, Florida")).toEqual({ city: "Tampa", state: "FL" });
  });

  it("parses city and state abbreviation", () => {
    expect(parseCityState("Tampa, FL")).toEqual({ city: "Tampa", state: "FL" });
  });

  it("parses city and state abbreviation without a comma", () => {
    expect(parseCityState("Tampa FL")).toEqual({ city: "Tampa", state: "FL" });
  });

  it("leaves unrecognized values as city-only text", () => {
    expect(parseCityState("Tampa Bay")).toEqual({ city: "Tampa Bay" });
  });
});

describe("parseLocationSearch", () => {
  it("parses a state abbreviation-only search", () => {
    expect(parseLocationSearch("FL")).toEqual({ state: "FL" });
  });
});
