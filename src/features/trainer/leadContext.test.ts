import { describe, it, expect } from "vitest";
import { buildLeadContext, interpolate } from "./leadContext";

const baseLead = { company: null, firstName: null, lastName: null, source: null };

describe("buildLeadContext", () => {
  it("prefers company for the lead name", () => {
    expect(buildLeadContext({ ...baseLead, company: "Acme" }).leadName).toBe("Acme");
  });
  it("falls back to first + last name", () => {
    expect(buildLeadContext({ ...baseLead, firstName: "John", lastName: "Smith" }).leadName).toBe("John Smith");
  });
  it("falls back to a generic name when nothing is set", () => {
    expect(buildLeadContext(baseLead).leadName).toBe("Your Local Business");
  });
  it("maps source to industry with a fallback", () => {
    expect(buildLeadContext({ ...baseLead, source: "Plumbing" }).industry).toBe("Plumbing");
    expect(buildLeadContext(baseLead).industry).toBe("your industry");
  });
  it("uses 'the company' fallback for company", () => {
    expect(buildLeadContext(baseLead).company).toBe("the company");
  });
});

describe("interpolate", () => {
  it("replaces all placeholders", () => {
    const out = interpolate("Hi, this is {{leadName}} at {{company}} in {{industry}}", {
      leadName: "Acme", company: "Acme", industry: "Plumbing",
    });
    expect(out).toBe("Hi, this is Acme at Acme in Plumbing");
  });
});
