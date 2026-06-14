import { afterEach, describe, it, expect, vi } from "vitest";
import { initials, avatarClass, relativeTime, ACTIVITY_VERB } from "./shared";

describe("initials", () => {
  it("returns the first letter of each of the first two words, uppercased", () => {
    expect(initials("John Doe")).toBe("JD");
  });

  it("handles a single-word name", () => {
    expect(initials("Alice")).toBe("A");
  });

  it("takes only the first two parts for multi-word names", () => {
    expect(initials("John Michael Doe")).toBe("JM");
  });

  it("returns the default fallback for null", () => {
    expect(initials(null)).toBe("?");
  });

  it("returns the default fallback for undefined", () => {
    expect(initials(undefined)).toBe("?");
  });

  it("returns the default fallback for an empty string", () => {
    expect(initials("")).toBe("?");
  });

  it("accepts a custom fallback character", () => {
    expect(initials(null, "#")).toBe("#");
  });

  it("uppercases the result", () => {
    expect(initials("alice bob")).toBe("AB");
  });
});

describe("avatarClass", () => {
  it("returns a class in the c1–c6 range for any seed", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      expect(avatarClass(seed)).toMatch(/^c[1-6]$/);
    }
  });

  it("returns a valid class for null", () => {
    expect(avatarClass(null)).toMatch(/^c[1-6]$/);
  });

  it("returns a valid class for undefined", () => {
    expect(avatarClass(undefined)).toMatch(/^c[1-6]$/);
  });

  it("is deterministic for the same seed", () => {
    expect(avatarClass("Alice")).toBe(avatarClass("Alice"));
    expect(avatarClass("Bob")).toBe(avatarClass("Bob"));
  });

  it("produces different classes for at least some different seeds", () => {
    const classes = ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank"].map(avatarClass);
    const unique = new Set(classes);
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe("relativeTime", () => {
  afterEach(() => vi.useRealTimers());

  it("returns 'just now' for a timestamp within the last 60 seconds", () => {
    vi.setSystemTime(new Date("2024-01-01T12:00:45Z"));
    expect(relativeTime("2024-01-01T12:00:00Z")).toBe("just now");
  });

  it("returns minutes ago for a timestamp within the last hour", () => {
    vi.setSystemTime(new Date("2024-01-01T12:30:00Z"));
    expect(relativeTime("2024-01-01T12:00:00Z")).toBe("30m ago");
  });

  it("returns hours ago for a timestamp within the last 24 hours", () => {
    vi.setSystemTime(new Date("2024-01-01T15:00:00Z"));
    expect(relativeTime("2024-01-01T12:00:00Z")).toBe("3h ago");
  });

  it("returns a locale date string for timestamps older than 24 hours", () => {
    vi.setSystemTime(new Date("2024-01-03T12:00:00Z"));
    const result = relativeTime("2024-01-01T12:00:00Z");
    expect(result).not.toMatch(/ago/);
    expect(result).toMatch(/\d/);
  });

  it("accepts a Date object as input", () => {
    vi.setSystemTime(new Date("2024-01-01T12:05:00Z"));
    expect(relativeTime(new Date("2024-01-01T12:00:00Z"))).toBe("5m ago");
  });

  it("does not return negative time for future dates", () => {
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
    const result = relativeTime("2024-01-01T12:00:30Z");
    expect(result).toBe("just now");
  });
});

describe("ACTIVITY_VERB", () => {
  const expectedKeys = [
    "LEAD_CREATED",
    "LEAD_ASSIGNED",
    "LEAD_DELETED",
    "CALL_OUTCOME",
    "CALL_LOGGED",
    "TASK_CREATED",
    "TASK_COMPLETED",
    "NOTE_ADDED",
    "NOTE_DELETED",
  ];

  for (const key of expectedKeys) {
    it(`has a non-empty string entry for ${key}`, () => {
      expect(typeof ACTIVITY_VERB[key]).toBe("string");
      expect(ACTIVITY_VERB[key].length).toBeGreaterThan(0);
    });
  }
});
