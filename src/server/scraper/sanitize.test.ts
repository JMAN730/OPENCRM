import { describe, it, expect } from "vitest";
import { sanitizeLocation, sanitizeLocations, parseLocationsBlob } from "./sanitize";

describe("sanitizeLocation", () => {
  it("accepts simple city, state pairs", () => {
    expect(sanitizeLocation("Toledo, Ohio")).toBe("Toledo, Ohio");
  });

  it("trims and collapses whitespace", () => {
    expect(sanitizeLocation("  Toledo,   Ohio  ")).toBe("Toledo, Ohio");
  });

  it("allows apostrophes, hyphens, parens", () => {
    expect(sanitizeLocation("Coeur d'Alene, ID (north)")).toBe("Coeur d'Alene, ID (north)");
    expect(sanitizeLocation("Winston-Salem, NC")).toBe("Winston-Salem, NC");
  });

  it("rejects shell metacharacters", () => {
    expect(() => sanitizeLocation("Toledo; rm -rf /")).toThrow();
    expect(() => sanitizeLocation("Toledo`whoami`")).toThrow();
    expect(() => sanitizeLocation("Toledo$(id)")).toThrow();
    expect(() => sanitizeLocation("Toledo|cat")).toThrow();
  });

  it("rejects empty values", () => {
    expect(() => sanitizeLocation("   ")).toThrow();
  });

  it("rejects values longer than 120 chars", () => {
    expect(() => sanitizeLocation("a".repeat(121))).toThrow();
  });
});

describe("sanitizeLocations", () => {
  it("dedupes case-insensitively", () => {
    expect(sanitizeLocations(["Toledo, OH", "toledo, oh", "Akron, OH"])).toEqual([
      "Toledo, OH",
      "Akron, OH",
    ]);
  });

  it("throws if all entries are invalid", () => {
    expect(() => sanitizeLocations([" "])).toThrow();
  });
});

describe("parseLocationsBlob", () => {
  it("splits on newlines, commas, semicolons", () => {
    expect(parseLocationsBlob("Toledo, OH\nAkron, OH\nColumbus, OH")).toEqual([
      "Toledo",
      "OH",
      "Akron",
      "OH",
      "Columbus",
      "OH",
    ]);
  });

  it("filters empties", () => {
    expect(parseLocationsBlob("\n\n  \nToledo\n")).toEqual(["Toledo"]);
  });
});
