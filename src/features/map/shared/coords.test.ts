import { describe, it, expect } from "vitest";
import { parseLatLngFromMapsUrl, boundsSchema, bboxAreaDeg2 } from "./coords";

describe("parseLatLngFromMapsUrl", () => {
  it("extracts place coordinates from the !3d!4d data segment", () => {
    const url =
      "https://www.google.com/maps/place/Joe's+Landscaping/data=!4m7!3m6!1s0x0:0x0!8m2!3d41.6528052!4d-83.5378674";
    expect(parseLatLngFromMapsUrl(url)).toEqual({ lat: 41.6528052, lng: -83.5378674 });
  });

  it("prefers !3d!4d place coords over the /@ viewport center", () => {
    const url =
      "https://www.google.com/maps/place/Acme/@40.0,-80.0,15z/data=!3d41.65!4d-83.53";
    expect(parseLatLngFromMapsUrl(url)).toEqual({ lat: 41.65, lng: -83.53 });
  });

  it("falls back to the /@lat,lng viewport center", () => {
    const url = "https://www.google.com/maps/place/Acme/@30.2672,-97.7431,12z";
    expect(parseLatLngFromMapsUrl(url)).toEqual({ lat: 30.2672, lng: -97.7431 });
  });

  it("handles negative latitudes and integer coordinates", () => {
    expect(parseLatLngFromMapsUrl("https://maps.google.com/x!3d-33.86!4d151.2")).toEqual({
      lat: -33.86,
      lng: 151.2,
    });
  });

  it("returns null for URLs without coordinates", () => {
    expect(parseLatLngFromMapsUrl("https://www.google.com/maps/search/plumbers")).toBeNull();
  });

  it("returns null for empty and missing input", () => {
    expect(parseLatLngFromMapsUrl("")).toBeNull();
    expect(parseLatLngFromMapsUrl(null)).toBeNull();
    expect(parseLatLngFromMapsUrl(undefined)).toBeNull();
  });

  it("rejects the (0, 0) no-data sentinel", () => {
    expect(parseLatLngFromMapsUrl("https://maps.google.com/x!3d0!4d0")).toBeNull();
  });

  it("rejects out-of-range coordinates", () => {
    expect(parseLatLngFromMapsUrl("https://maps.google.com/x!3d91.5!4d10.0")).toBeNull();
    expect(parseLatLngFromMapsUrl("https://maps.google.com/x!3d10.0!4d181.0")).toBeNull();
  });
});

describe("boundsSchema", () => {
  it("accepts a valid bounding box", () => {
    const result = boundsSchema.safeParse({ south: 30, west: -98, north: 31, east: -97 });
    expect(result.success).toBe(true);
  });

  it("rejects south >= north", () => {
    expect(
      boundsSchema.safeParse({ south: 31, west: -98, north: 30, east: -97 }).success,
    ).toBe(false);
  });

  it("rejects west >= east", () => {
    expect(
      boundsSchema.safeParse({ south: 30, west: -97, north: 31, east: -98 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range values", () => {
    expect(
      boundsSchema.safeParse({ south: -95, west: -98, north: 31, east: -97 }).success,
    ).toBe(false);
  });
});

describe("bboxAreaDeg2", () => {
  it("multiplies the latitude and longitude spans", () => {
    expect(bboxAreaDeg2({ south: 30, west: -98, north: 30.5, east: -97 })).toBeCloseTo(0.5);
  });
});
