import { describe, it, expect, beforeEach } from "vitest";
import { createMockPrisma, type MockPrisma } from "@/test/trpc";
import type { PrismaClient } from "@prisma/client";
import {
  parseSource,
  getTopCallers,
  getLeadQuality,
  getRepPerformance,
  getPipelineMetrics,
  getConversionInsights,
} from "./salesAnalytics";

const ORG = "org-1";
const db = (p: MockPrisma) => p as unknown as PrismaClient;

describe("parseSource", () => {
  it("extracts channel/niche/city from a GoogleMaps source string", () => {
    expect(parseSource("GoogleMaps / Landscaping / Toledo, Ohio")).toEqual({
      channel: "Google Maps",
      niche: "Landscaping",
      city: "Toledo",
    });
  });

  it("returns Manual entry / Unknown for a null source", () => {
    expect(parseSource(null)).toEqual({ channel: "Manual entry", niche: "Unknown", city: "Unknown" });
  });

  it("treats a non-GoogleMaps source as a bare channel", () => {
    expect(parseSource("Referral")).toEqual({ channel: "Referral", niche: "Unknown", city: "Unknown" });
  });
});

describe("getTopCallers", () => {
  let prisma: MockPrisma;
  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it("computes connection rate and close rate per rep", async () => {
    prisma.callLog.groupBy.mockResolvedValue([
      { userId: "u1", status: "CONNECTED", _count: { id: 3 } },
      { userId: "u1", status: "NO_ANSWER", _count: { id: 7 } },
    ]);
    prisma.lead.groupBy.mockResolvedValue([
      { assignedToId: "u1", status: "CONNECTED", _count: { id: 5 } },
      { assignedToId: "u1", status: "NO_ANSWER", _count: { id: 15 } },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: "u1", name: "Jonas", email: "j@x.com" }]);

    const [rep] = await getTopCallers(db(prisma), ORG);
    expect(rep).toMatchObject({
      userId: "u1",
      name: "Jonas",
      totalCalls: 10,
      connectedCalls: 3,
      connectionRate: 30,
      leadsAssigned: 20,
      conversions: 5,
      closeRate: 25,
      bookedAppointments: null,
    });
  });

  it("returns an empty array when there is no activity", async () => {
    prisma.callLog.groupBy.mockResolvedValue([]);
    prisma.lead.groupBy.mockResolvedValue([]);
    const result = await getTopCallers(db(prisma), ORG);
    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("sorts by connection rate descending", async () => {
    prisma.callLog.groupBy.mockResolvedValue([
      { userId: "u1", status: "CONNECTED", _count: { id: 1 } },
      { userId: "u1", status: "NO_ANSWER", _count: { id: 9 } },
      { userId: "u2", status: "CONNECTED", _count: { id: 5 } },
      { userId: "u2", status: "NO_ANSWER", _count: { id: 5 } },
    ]);
    prisma.lead.groupBy.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([
      { id: "u1", name: "Low", email: null },
      { id: "u2", name: "High", email: null },
    ]);
    const result = await getTopCallers(db(prisma), ORG);
    expect(result[0].name).toBe("High");
    expect(result[0].connectionRate).toBe(50);
  });
});

describe("getLeadQuality", () => {
  let prisma: MockPrisma;
  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it("computes niche/city/source conversion rates from source strings", async () => {
    prisma.lead.groupBy.mockResolvedValue([
      { source: "GoogleMaps / Landscaping / Toledo, Ohio", city: null, status: "CONNECTED", _count: { id: 2 } },
      { source: "GoogleMaps / Landscaping / Toledo, Ohio", city: null, status: "NO_ANSWER", _count: { id: 8 } },
      { source: "GoogleMaps / Cleaning / Maumee, Ohio", city: null, status: "CONNECTED", _count: { id: 1 } },
      { source: "GoogleMaps / Cleaning / Maumee, Ohio", city: null, status: "NO_ANSWER", _count: { id: 1 } },
    ]);

    const q = await getLeadQuality(db(prisma), ORG);

    // Sorted by conversion rate desc → Cleaning (50%) before Landscaping (20%)
    expect(q.byNiche[0]).toEqual({ key: "Cleaning", total: 2, converted: 1, conversionRate: 50 });
    expect(q.byNiche[1]).toEqual({ key: "Landscaping", total: 10, converted: 2, conversionRate: 20 });
    expect(q.byCity.find((c) => c.key === "Toledo")).toEqual({ key: "Toledo", total: 10, converted: 2, conversionRate: 20 });
    expect(q.bySource[0]).toEqual({ key: "Google Maps", total: 12, converted: 3, conversionRate: 25 });
  });

  it("prefers the Lead.city column over the parsed source city", async () => {
    prisma.lead.groupBy.mockResolvedValue([
      { source: "GoogleMaps / Fencing / Toledo, Ohio", city: "Sylvania", status: "CONNECTED", _count: { id: 4 } },
    ]);
    const q = await getLeadQuality(db(prisma), ORG);
    expect(q.byCity[0].key).toBe("Sylvania");
  });
});

describe("getRepPerformance", () => {
  let prisma: MockPrisma;
  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it("aggregates pipeline value, touches, conversions and response time", async () => {
    prisma.lead.groupBy
      .mockResolvedValueOnce([{ assignedToId: "u1", _sum: { value: 5000 } }]) // value
      .mockResolvedValueOnce([{ assignedToId: "u1", _avg: { touchCount: 3.4 } }]) // touches
      .mockResolvedValueOnce([{ assignedToId: "u1", _count: { id: 5 } }]); // conversions
    prisma.$queryRaw.mockResolvedValue([{ userId: "u1", avg_seconds: 7200 }]); // 2h
    prisma.user.findMany.mockResolvedValue([{ id: "u1", name: "Jonas", email: null }]);

    const [rep] = await getRepPerformance(db(prisma), ORG);
    expect(rep).toMatchObject({
      userId: "u1",
      name: "Jonas",
      avgResponseHours: 2,
      followUpConsistency: 3.4,
      appointmentsBooked: null,
      pipelineValue: 5000,
      conversions: 5,
    });
  });

  it("reports null response time when no calls were made", async () => {
    prisma.lead.groupBy
      .mockResolvedValueOnce([{ assignedToId: "u1", _sum: { value: 0 } }])
      .mockResolvedValueOnce([{ assignedToId: "u1", _avg: { touchCount: 0 } }])
      .mockResolvedValueOnce([{ assignedToId: "u1", _count: { id: 0 } }]);
    prisma.$queryRaw.mockResolvedValue([{ userId: "u1", avg_seconds: null }]);
    prisma.user.findMany.mockResolvedValue([{ id: "u1", name: "Jonas", email: null }]);

    const [rep] = await getRepPerformance(db(prisma), ORG);
    expect(rep.avgResponseHours).toBeNull();
  });
});

describe("getPipelineMetrics", () => {
  it("derives total, connected and conversion rate from status groups", async () => {
    const prisma = createMockPrisma();
    prisma.lead.groupBy.mockResolvedValue([
      { status: "CONNECTED", _count: { id: 38 } },
      { status: "NO_ANSWER", _count: { id: 153 } },
    ]);
    const m = await getPipelineMetrics(db(prisma), ORG);
    expect(m.total).toBe(191);
    expect(m.connected).toBe(38);
    expect(m.conversionRate).toBe(19.9);
    expect(m.byStatus[0]).toEqual({ status: "NO_ANSWER", count: 153 });
  });
});

describe("getConversionInsights", () => {
  it("ignores buckets below the minimum sample size", async () => {
    const prisma = createMockPrisma();
    prisma.lead.groupBy.mockResolvedValue([
      { source: "GoogleMaps / Landscaping / Toledo, Ohio", city: null, status: "CONNECTED", _count: { id: 2 } },
      { source: "GoogleMaps / Landscaping / Toledo, Ohio", city: null, status: "NO_ANSWER", _count: { id: 8 } },
      // Cleaning has only 1 lead → below minSample of 3, must be excluded
      { source: "GoogleMaps / Cleaning / Maumee, Ohio", city: null, status: "CONNECTED", _count: { id: 1 } },
    ]);
    const insights = await getConversionInsights(db(prisma), ORG);
    expect(insights.bestNiche?.key).toBe("Landscaping");
    expect(insights.topNiches.some((n) => n.key === "Cleaning")).toBe(false);
  });
});
