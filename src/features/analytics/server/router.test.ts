import { describe, it, expect, beforeEach } from "vitest";
import { createTestCaller } from "@/test/trpc";
import type { MockPrisma } from "@/test/trpc";

// Helper to build a day-row as the DB returns it
function dayRow(isoDate: string, count: number) {
  return { day: new Date(isoDate), count: BigInt(count) };
}

describe("analyticsRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: MockPrisma;

  beforeEach(() => {
    const result = createTestCaller();
    caller = result.caller;
    prisma = result.prisma;
  });

  function setupDefaults() {
    // $queryRaw is called twice: leads-per-day, then calls-per-day
    prisma.$queryRaw
      .mockResolvedValueOnce([]) // leadsPerDayRows
      .mockResolvedValueOnce([]); // callsPerDayRows

    prisma.lead.groupBy.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);
    prisma.callLog.count.mockResolvedValue(0);
  }

  describe("overview — basic shape", () => {
    it("returns the expected top-level keys", async () => {
      setupDefaults();
      const result = await caller.analytics.overview();

      expect(result).toHaveProperty("kpis");
      expect(result).toHaveProperty("leadsPerDay");
      expect(result).toHaveProperty("callsPerDay");
      expect(result).toHaveProperty("touchDepth");
      expect(result).toHaveProperty("bySource");
      expect(result).toHaveProperty("byTemperature");
    });

    it("produces a 30-element leadsPerDay array", async () => {
      setupDefaults();
      const { leadsPerDay } = await caller.analytics.overview();
      expect(leadsPerDay).toHaveLength(30);
      expect(leadsPerDay[0]).toHaveProperty("date");
      expect(leadsPerDay[0]).toHaveProperty("count");
    });

    it("produces a 30-element callsPerDay array", async () => {
      setupDefaults();
      const { callsPerDay } = await caller.analytics.overview();
      expect(callsPerDay).toHaveLength(30);
    });
  });

  describe("overview — KPIs", () => {
    it("aggregates totalLeads, leadsThisWeek, callsThisWeek, connectedCount", async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.lead.groupBy.mockResolvedValue([]);
      // lead.count is called 3 times: total, thisWeek, connected
      prisma.lead.count
        .mockResolvedValueOnce(120)  // totalLeads
        .mockResolvedValueOnce(8)    // leadsThisWeek
        .mockResolvedValueOnce(34);  // connectedCount
      prisma.callLog.count.mockResolvedValue(15);

      const { kpis } = await caller.analytics.overview();
      expect(kpis.totalLeads).toBe(120);
      expect(kpis.leadsThisWeek).toBe(8);
      expect(kpis.callsThisWeek).toBe(15);
      expect(kpis.connectedCount).toBe(34);
    });

    it("computes contactRate as 0.0 when there are no leads", async () => {
      setupDefaults();
      const { kpis } = await caller.analytics.overview();
      expect(kpis.contactRate).toBe("0.0");
    });

    it("computes contactRate correctly when some leads are untouched", async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      // touchCount groupBy: 40 untouched (0), 60 touched (1+)
      prisma.lead.groupBy
        .mockResolvedValueOnce([
          { touchCount: 0, _count: { id: 40 } },
          { touchCount: 1, _count: { id: 60 } },
        ])
        .mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(100);
      prisma.callLog.count.mockResolvedValue(0);

      const { kpis } = await caller.analytics.overview();
      expect(kpis.contactRate).toBe("60.0");
    });
  });

  describe("overview — touch depth bucketing", () => {
    it("correctly bins touchCount values into the four buckets", async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.lead.groupBy
        .mockResolvedValueOnce([
          { touchCount: 0, _count: { id: 10 } },
          { touchCount: 1, _count: { id: 5 } },
          { touchCount: 3, _count: { id: 8 } },
          { touchCount: 7, _count: { id: 3 } },
        ])
        .mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(26);
      prisma.callLog.count.mockResolvedValue(0);

      const { touchDepth } = await caller.analytics.overview();
      expect(touchDepth.untouched).toBe(10);
      expect(touchDepth.one).toBe(5);
      expect(touchDepth.twoToFive).toBe(8);
      expect(touchDepth.sixPlus).toBe(3);
    });
  });

  describe("overview — bySource normalization", () => {
    it("collapses GoogleMaps/* variants into a single 'Google Maps' bucket", async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.lead.groupBy
        .mockResolvedValueOnce([])   // touchCount
        .mockResolvedValueOnce([     // source
          { source: "GoogleMaps/landscaping", _count: { id: 20 } },
          { source: "GoogleMaps/plumbing",    _count: { id: 15 } },
          { source: "Manual",                 _count: { id: 5 } },
        ])
        .mockResolvedValueOnce([]);  // temperatureOverride
      prisma.lead.count.mockResolvedValue(40);
      prisma.callLog.count.mockResolvedValue(0);

      const { bySource } = await caller.analytics.overview();
      const googleEntry = bySource.find((s) => s.source === "Google Maps");
      expect(googleEntry?.count).toBe(35);
      expect(bySource.find((s) => s.source === "Manual")?.count).toBe(5);
    });

    it("labels null/empty source as 'Manual entry'", async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.lead.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ source: null, _count: { id: 7 } }])
        .mockResolvedValueOnce([]);
      prisma.lead.count.mockResolvedValue(7);
      prisma.callLog.count.mockResolvedValue(0);

      const { bySource } = await caller.analytics.overview();
      expect(bySource[0].source).toBe("Manual entry");
      expect(bySource[0].count).toBe(7);
    });
  });

  describe("overview — byTemperature", () => {
    it("maps temperatureOverride null to 'Auto' and sorts by count desc", async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.lead.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { temperatureOverride: null,   _count: { id: 50 } },
          { temperatureOverride: "HOT",  _count: { id: 20 } },
          { temperatureOverride: "WARM", _count: { id: 30 } },
        ]);
      prisma.lead.count.mockResolvedValue(100);
      prisma.callLog.count.mockResolvedValue(0);

      const { byTemperature } = await caller.analytics.overview();
      expect(byTemperature[0]).toEqual({ temperature: "Auto", count: 50 });
      expect(byTemperature[1]).toEqual({ temperature: "WARM", count: 30 });
      expect(byTemperature[2]).toEqual({ temperature: "HOT", count: 20 });
    });
  });

  describe("topCallers", () => {
    it("returns ranked caller stats from call + lead groups", async () => {
      prisma.callLog.groupBy.mockResolvedValue([
        { userId: "u1", status: "CONNECTED", _count: { id: 4 } },
        { userId: "u1", status: "NO_ANSWER", _count: { id: 6 } },
      ]);
      prisma.lead.groupBy.mockResolvedValue([
        { assignedToId: "u1", status: "CONNECTED", _count: { id: 2 } },
        { assignedToId: "u1", status: "NO_ANSWER", _count: { id: 8 } },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: "u1", name: "Jonas", email: "j@x.com" }]);

      const result = await caller.analytics.topCallers();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ name: "Jonas", connectionRate: 40, closeRate: 20, bookedAppointments: null });
    });
  });

  describe("leadQuality", () => {
    it("returns niche, city and source conversion buckets", async () => {
      prisma.lead.groupBy.mockResolvedValue([
        { source: "GoogleMaps / Landscaping / Toledo, Ohio", city: null, status: "CONNECTED", _count: { id: 3 } },
        { source: "GoogleMaps / Landscaping / Toledo, Ohio", city: null, status: "NO_ANSWER", _count: { id: 7 } },
      ]);
      const result = await caller.analytics.leadQuality();
      expect(result).toHaveProperty("byNiche");
      expect(result).toHaveProperty("byCity");
      expect(result).toHaveProperty("bySource");
      expect(result.byNiche[0]).toEqual({ key: "Landscaping", total: 10, converted: 3, conversionRate: 30 });
    });
  });

  describe("repPerformance", () => {
    it("returns per-rep performance rows", async () => {
      prisma.lead.groupBy
        .mockResolvedValueOnce([{ assignedToId: "u1", _sum: { value: 2500 } }])
        .mockResolvedValueOnce([{ assignedToId: "u1", _avg: { touchCount: 2 } }])
        .mockResolvedValueOnce([{ assignedToId: "u1", _count: { id: 3 } }]);
      prisma.$queryRaw.mockResolvedValue([{ userId: "u1", avg_seconds: 3600 }]);
      prisma.user.findMany.mockResolvedValue([{ id: "u1", name: "Jonas", email: null }]);

      const result = await caller.analytics.repPerformance();
      expect(result[0]).toMatchObject({ name: "Jonas", pipelineValue: 2500, conversions: 3, avgResponseHours: 1, appointmentsBooked: null });
    });
  });

  describe("overview — day array population", () => {
    it("fills in non-zero counts on the correct dates", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const isoDate = yesterday.toISOString().split("T")[0];

      prisma.$queryRaw
        .mockResolvedValueOnce([dayRow(isoDate, 7)]) // leadsPerDay
        .mockResolvedValueOnce([]);
      prisma.lead.groupBy.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(7);
      prisma.callLog.count.mockResolvedValue(0);

      const { leadsPerDay } = await caller.analytics.overview();
      const entry = leadsPerDay.find((d) => d.date === isoDate);
      expect(entry?.count).toBe(7);
    });
  });
});
