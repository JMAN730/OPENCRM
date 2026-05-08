import { describe, it, expect, beforeEach } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("dashboardRouter.getKpiStats", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());

    // Default: zero of everything. Individual tests override as needed.
    prisma.lead.count.mockResolvedValue(0);
    prisma.callLog.count.mockResolvedValue(0);
    prisma.task.count.mockResolvedValue(0);
    prisma.lead.aggregate.mockResolvedValue({ _sum: { value: null } });
    prisma.callLog.groupBy.mockResolvedValue([]);
    prisma.callLog.findMany.mockResolvedValue([]);
  });

  it("rejects callers without an organization", async () => {
    const { caller: orphan } = createTestCaller({
      sessionOverrides: { organizationId: null },
    });

    await expect(orphan.dashboard.getKpiStats()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("returns 0.0% conversion rate when there are no leads (no divide-by-zero)", async () => {
    const result = await caller.dashboard.getKpiStats();
    expect(result.conversionRate).toBe("0.0%");
  });

  it("computes conversionRate = qualified / total * 100", async () => {
    // Order of prisma.lead.count calls inside Promise.all:
    //   1) totalLeadsCount         = 200
    //   2) appointmentsSetCount    = 50  (status in QUALIFIED|WON)
    //   3) qualifiedLeadsCount     = 50  (status QUALIFIED)
    prisma.lead.count
      .mockResolvedValueOnce(200) // total
      .mockResolvedValueOnce(50) // appointments
      .mockResolvedValueOnce(50); // qualified

    const result = await caller.dashboard.getKpiStats();
    expect(result.conversionRate).toBe("25.0%");
    expect(result.totalLeads).toBe(200);
    expect(result.appointmentsSet).toBe(50);
  });

  it("falls back to 0 monthly revenue when aggregate _sum.value is null", async () => {
    prisma.lead.aggregate.mockResolvedValue({ _sum: { value: null } });
    const result = await caller.dashboard.getKpiStats();
    expect(result.monthlyRevenue).toBe(0);
  });

  it("returns the aggregated monthly revenue when present", async () => {
    prisma.lead.aggregate.mockResolvedValue({ _sum: { value: 12345 } });
    const result = await caller.dashboard.getKpiStats();
    expect(result.monthlyRevenue).toBe(12345);
  });

  it("returns 7 daily call buckets, in chronological order", async () => {
    // 7 callLog.count calls correspond to dayOffsets [6,5,4,3,2,1,0]
    prisma.callLog.count
      .mockResolvedValueOnce(0) // callsToday — first call inside Promise.all
      .mockResolvedValueOnce(10) // -6
      .mockResolvedValueOnce(11) // -5
      .mockResolvedValueOnce(12) // -4
      .mockResolvedValueOnce(13) // -3
      .mockResolvedValueOnce(14) // -2
      .mockResolvedValueOnce(15) // -1
      .mockResolvedValueOnce(16); // today

    const result = await caller.dashboard.getKpiStats();
    expect(result.charts.callsPerDay).toHaveLength(7);
    expect(result.charts.callsPerDay.map((d) => d.count)).toEqual([10, 11, 12, 13, 14, 15, 16]);

    // Date strings should be ascending YYYY-MM-DD
    const dates = result.charts.callsPerDay.map((d) => d.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("flattens groupBy results into {status, count} pairs", async () => {
    prisma.callLog.groupBy.mockResolvedValue([
      { status: "CONNECTED", _count: { id: 7 } },
      { status: "BUSY", _count: { id: 2 } },
    ]);

    const result = await caller.dashboard.getKpiStats();
    expect(result.charts.statusDistribution).toEqual([
      { status: "CONNECTED", count: 7 },
      { status: "BUSY", count: 2 },
    ]);
  });

  it("substitutes 'Unknown' when a recent call's lead has no phone", async () => {
    prisma.callLog.findMany.mockResolvedValue([
      {
        id: "c1",
        status: "CONNECTED",
        duration: 60,
        createdAt: new Date("2026-05-08T10:00:00Z"),
        lead: { phone: null },
      },
    ]);

    const result = await caller.dashboard.getKpiStats();
    expect(result.recentCalls[0]).toEqual({
      id: "c1",
      status: "CONNECTED",
      duration: 60,
      createdAt: "2026-05-08T10:00:00.000Z",
      phone: "Unknown",
    });
  });

  it("scopes every query to the caller's organizationId", async () => {
    await caller.dashboard.getKpiStats();

    // All prisma.lead.count / .aggregate / callLog.count calls must include organizationId.
    for (const call of prisma.lead.count.mock.calls) {
      expect(call[0].where.organizationId).toBe("org-1");
    }
    for (const call of prisma.callLog.count.mock.calls) {
      expect(call[0].where.lead.organizationId).toBe("org-1");
    }
    expect(prisma.lead.aggregate.mock.calls[0][0].where.organizationId).toBe("org-1");
  });
});
