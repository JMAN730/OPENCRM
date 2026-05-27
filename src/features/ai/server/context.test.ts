import { describe, it, expect, beforeEach } from "vitest";
import { createMockPrisma, type MockPrisma } from "@/test/trpc";
import type { PrismaClient } from "@prisma/client";
import type { LeadScope } from "@/server/teams/scope";
import {
  buildAIContext,
  formatAIContext,
  scopeCacheKey,
  SALES_MANAGER_SYSTEM_PROMPT,
  type AIContext,
} from "./context";

const ORG = "org-1";
const db = (p: MockPrisma) => p as unknown as PrismaClient;
const ALL: LeadScope = { kind: "all", organizationId: ORG };

function sampleContext(): AIContext {
  return {
    orgStatistics: {
      totalLeads: 100,
      connectedLeads: 30,
      conversionRate: 30,
      callsTotal: 300,
      callsThisWeek: 50,
      connectedCallsThisWeek: 15,
    },
    repRankings: [
      {
        userId: "u1",
        name: "Jonas",
        totalCalls: 142,
        connectedCalls: 44,
        connectionRate: 31,
        leadsAssigned: 80,
        conversions: 20,
        closeRate: 25,
        bookedAppointments: null,
      },
    ],
    repPerformance: [
      {
        userId: "u1",
        name: "Jonas",
        avgResponseHours: 4,
        followUpConsistency: 3,
        appointmentsBooked: null,
        pipelineValue: 0,
        conversions: 20,
      },
    ],
    pipelineMetrics: {
      total: 100,
      connected: 30,
      conversionRate: 30,
      byStatus: [{ status: "CONNECTED", count: 30 }],
    },
    recentActivity: [],
    conversionInsights: {
      bestNiche: { key: "Mobile Mechanics", total: 12, converted: 6, conversionRate: 50 },
      bestCity: { key: "Toledo", total: 40, converted: 14, conversionRate: 35 },
      bestSource: { key: "Google Maps", total: 100, converted: 30, conversionRate: 30 },
      topNiches: [{ key: "Mobile Mechanics", total: 12, converted: 6, conversionRate: 50 }],
      topCities: [{ key: "Toledo", total: 40, converted: 14, conversionRate: 35 }],
    },
  };
}

describe("SALES_MANAGER_SYSTEM_PROMPT", () => {
  it("frames the assistant as a sales manager and forbids hallucination", () => {
    expect(SALES_MANAGER_SYSTEM_PROMPT).toContain("AI sales manager");
    expect(SALES_MANAGER_SYSTEM_PROMPT).toContain("Never say you lack data unless the metric truly does not exist");
  });
});

describe("scopeCacheKey", () => {
  it("separates org-wide and per-user scopes so snapshots can't leak across scopes", () => {
    expect(scopeCacheKey({ kind: "all", organizationId: ORG })).toBe("all:org-1");
    const a = scopeCacheKey({ kind: "users", organizationId: ORG, userIds: ["u2", "u1"] });
    const b = scopeCacheKey({ kind: "users", organizationId: ORG, userIds: ["u1", "u2"] });
    expect(a).toBe(b); // order-independent
    expect(a).not.toBe("all:org-1");
  });
});

describe("formatAIContext", () => {
  it("renders real metrics and labels booked appointments as not tracked", () => {
    const text = formatAIContext(sampleContext());
    expect(text).toContain("Jonas");
    expect(text).toContain("31% connect rate");
    expect(text).toContain("Best niche: Mobile Mechanics (50% conversion");
    expect(text).toContain("Best city: Toledo");
    // Honest about the missing metric, never fabricated.
    expect(text).toContain("Booked appointments");
    expect(text.toLowerCase()).toContain("not tracked");
  });

  it("handles an empty org without throwing", () => {
    const empty: AIContext = {
      orgStatistics: { totalLeads: 0, connectedLeads: 0, conversionRate: 0, callsTotal: 0, callsThisWeek: 0, connectedCallsThisWeek: 0 },
      repRankings: [],
      repPerformance: [],
      pipelineMetrics: { total: 0, connected: 0, conversionRate: 0, byStatus: [] },
      recentActivity: [],
      conversionInsights: { bestNiche: null, bestCity: null, bestSource: null, topNiches: [], topCities: [] },
    };
    const text = formatAIContext(empty);
    expect(text).toContain("No call activity recorded yet");
    expect(text).toContain("not enough data");
  });
});

describe("buildAIContext", () => {
  let prisma: MockPrisma;
  beforeEach(() => {
    prisma = createMockPrisma();
    // Branch lead.groupBy on its arguments so the many call sites each get
    // appropriate data regardless of ordering.
    prisma.lead.groupBy.mockImplementation((args: { by: string[]; _sum?: unknown; _avg?: unknown }) => {
      const by = args.by;
      if (by.includes("source")) {
        return Promise.resolve([
          { source: "GoogleMaps / Landscaping / Toledo, Ohio", city: null, status: "CONNECTED", _count: { id: 5 } },
          { source: "GoogleMaps / Landscaping / Toledo, Ohio", city: null, status: "NO_ANSWER", _count: { id: 5 } },
        ]);
      }
      if (by.includes("assignedToId") && by.includes("status")) {
        return Promise.resolve([{ assignedToId: "u1", status: "CONNECTED", _count: { id: 5 } }]);
      }
      if (by.includes("assignedToId")) {
        if (args._sum) return Promise.resolve([{ assignedToId: "u1", _sum: { value: 1000 } }]);
        if (args._avg) return Promise.resolve([{ assignedToId: "u1", _avg: { touchCount: 3 } }]);
        return Promise.resolve([{ assignedToId: "u1", _count: { id: 5 } }]);
      }
      if (by.includes("status")) {
        return Promise.resolve([
          { status: "CONNECTED", _count: { id: 5 } },
          { status: "NO_ANSWER", _count: { id: 10 } },
        ]);
      }
      return Promise.resolve([]);
    });
    prisma.callLog.groupBy.mockResolvedValue([{ userId: "u1", status: "CONNECTED", _count: { id: 3 } }]);
    prisma.callLog.count.mockResolvedValue(7);
    prisma.user.findMany.mockResolvedValue([{ id: "u1", name: "Jonas", email: null }]);
    prisma.$queryRaw.mockResolvedValue([{ userId: "u1", avg_seconds: 3600 }]);
    prisma.activity.findMany.mockResolvedValue([]);
  });

  it("returns the full structured context shape", async () => {
    const ctx = await buildAIContext(db(prisma), ALL);
    expect(ctx).toHaveProperty("orgStatistics");
    expect(ctx).toHaveProperty("repRankings");
    expect(ctx).toHaveProperty("repPerformance");
    expect(ctx).toHaveProperty("pipelineMetrics");
    expect(ctx).toHaveProperty("recentActivity");
    expect(ctx).toHaveProperty("conversionInsights");

    expect(ctx.orgStatistics.totalLeads).toBe(15);
    expect(ctx.orgStatistics.connectedLeads).toBe(5);
    expect(ctx.repRankings[0]?.name).toBe("Jonas");
    expect(ctx.conversionInsights.bestNiche?.key).toBe("Landscaping");
  });
});
