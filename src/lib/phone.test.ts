import { describe, it, expect } from "vitest";
import { formatPhone } from "./phone";

describe("formatPhone", () => {
  it("formats a 10-digit number as NXX-NXX-XXXX", () => {
    expect(formatPhone("5551234567")).toBe("555-123-4567");
  });

  it("strips non-digit characters before formatting", () => {
    expect(formatPhone("(555) 123-4567")).toBe("555-123-4567");
  });

  it("strips leading country code 1 from 11-digit US numbers", () => {
    expect(formatPhone("15551234567")).toBe("555-123-4567");
  });

  it("does not strip leading digit from 11-digit numbers not starting with 1", () => {
    expect(formatPhone("25551234567")).toBe("25551234567");
  });

  it("returns the raw value for non-standard-length digit strings", () => {
    expect(formatPhone("12345")).toBe("12345");
  });

  it("returns empty string for null", () => {
    expect(formatPhone(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatPhone(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatPhone("")).toBe("");
  });

  it("handles a number with dots as separators", () => {
    expect(formatPhone("555.123.4567")).toBe("555-123-4567");
  });
});
