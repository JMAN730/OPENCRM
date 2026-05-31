import { describe, expect, it } from "vitest";

import { getMapsUrl, parseCityState, parseLocationSearch } from "@/features/leads/location";

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

describe("getMapsUrl", () => {
  it("prefers the exact stored maps URL captured by the scraper", () => {
    expect(
      getMapsUrl({
        mapsUrl: "https://www.google.com/maps/place/Acme",
        company: "Acme",
        phone: "555-1234",
      }),
    ).toBe("https://www.google.com/maps/place/Acme");
  });

  it("includes the phone number in the fallback search to land on the exact listing", () => {
    const url = getMapsUrl({
      mapsUrl: null,
      company: "Acme Plumbing",
      city: "Tampa",
      state: "FL",
      phone: "555-1234",
    });
    expect(url).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Acme Plumbing Tampa, FL 555-1234")}`,
    );
  });

  it("returns null when there is nothing to search for", () => {
    expect(getMapsUrl({ mapsUrl: null, company: null, phone: null })).toBeNull();
  });
});
