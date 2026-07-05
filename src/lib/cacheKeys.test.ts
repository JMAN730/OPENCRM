import { describe, it, expect } from "vitest";
import { keys } from "./cacheKeys";

describe("cache key builders", () => {
  it("scopes org-derived keys by organizationId", () => {
    expect(keys.dashboardKpi("org-1")).toBe("dashboard:kpi:org-1");
    expect(keys.dashboardSidebar("org-1")).toBe("dashboard:sidebar:org-1");
    expect(keys.dashboardTeam("org-1")).toBe("dashboard:team:org-1");
    expect(keys.emailSendBucket("org-1")).toBe("email-send:org-1");
  });

  it("scopes per-lead buckets by org and lead", () => {
    expect(keys.emailGenBucket("org-1", "lead-9")).toBe("email-gen:org-1:lead-9");
    expect(keys.demoGenBucket("org-1", "lead-9")).toBe("demo-gen:org-1:lead-9");
  });

  it("produces distinct namespaces per builder", () => {
    const all = Object.values(keys).map((fn) =>
      (fn as (...args: string[]) => string)("a", "b"),
    );
    expect(new Set(all).size).toBe(all.length);
  });
});
