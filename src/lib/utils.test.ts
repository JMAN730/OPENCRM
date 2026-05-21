import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins simple class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("omits falsy values", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("merges conflicting Tailwind classes, last one wins", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles undefined and null without error", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b");
  });

  it("supports object syntax", () => {
    expect(cn({ "text-red-500": true, "text-blue-500": false })).toBe("text-red-500");
  });

  it("supports array syntax", () => {
    expect(cn(["a", "b"])).toBe("a b");
  });

  it("returns empty string when called with no arguments", () => {
    expect(cn()).toBe("");
  });

  it("merges padding utilities correctly", () => {
    expect(cn("p-2", "pt-4")).toBe("p-2 pt-4");
  });
});
