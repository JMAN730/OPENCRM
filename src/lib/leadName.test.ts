import { describe, it, expect } from "vitest";
import { leadDisplayName } from "./leadName";

describe("leadDisplayName", () => {
  it("returns company when present", () => {
    expect(leadDisplayName({ company: "Acme Corp", firstName: "John", lastName: "Doe" })).toBe(
      "Acme Corp",
    );
  });

  it("falls back to full name when company is absent", () => {
    expect(leadDisplayName({ company: "", firstName: "John", lastName: "Doe" })).toBe("John Doe");
  });

  it("uses only first name when last name is absent", () => {
    expect(leadDisplayName({ company: "", firstName: "John", lastName: "" })).toBe("John");
  });

  it("returns 'Unnamed' when all fields are empty", () => {
    expect(leadDisplayName({ company: "", firstName: "", lastName: "" })).toBe("Unnamed");
  });

  it("returns 'Unnamed' when all fields are null", () => {
    expect(leadDisplayName({ company: null, firstName: null, lastName: null })).toBe("Unnamed");
  });

  it("honors a custom fallback", () => {
    expect(leadDisplayName({ company: null }, "Your Local Business")).toBe("Your Local Business");
  });

  it("returns empty string for a missing lead", () => {
    expect(leadDisplayName(null)).toBe("");
  });
});
