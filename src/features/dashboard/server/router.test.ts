import { describe, it, expect, beforeEach } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("dashboardRouter.getKpiStats", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());

    // Default: zero of everything. Individual tests override as needed.
    prisma.callLog.count.mockResolvedValue(0);
    prisma.task.count.mockResolvedValue(0);
    prisma.lead.aggregate.mockResolvedValue({ _sum: { value: null } });
    prisma.callLog.groupBy.mockResolvedValue([]);
    prisma.lead.groupBy.mockResolvedValue([]);
    prisma.callLog.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
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
    expect(result.totalLeads).toBe(0);
  });

  it("derives totals/qualified from a single lead.groupBy call (no separate counts)", async () => {
    prisma.lead.groupBy.mockResolvedValue([
      { status: "NOT_CONTACTED", _count: { id: 150 } },
      { status: "CONNECTED", _count: { id: 50 } },
    ]);

    const result = await caller.dashboard.getKpiStats();

    expect(result.totalLeads).toBe(200);
    expect(result.appointmentsSet).toBe(50);
    expect(result.conversionRate).toBe("25.0%");
    // Old implementation ran three lead.count calls; new implementation runs none.
    expect(prisma.lead.count).not.toHaveBeenCalled();
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

  it("returns 7 daily call buckets in chronological order, filling missing days with 0", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOf = (offset: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() - offset);
      return d;
    };

    // Raw query returns sparse buckets — the router fills in the rest.
    prisma.$queryRaw.mockResolvedValue([
      { day: dayOf(6), count: BigInt(10) },
      { day: dayOf(5), count: BigInt(11) },
      // -4 missing → expect 0
      { day: dayOf(3), count: BigInt(13) },
      { day: dayOf(0), count: BigInt(16) },
    ]);

    const result = await caller.dashboard.getKpiStats();

    expect(result.charts.callsPerDay).toHaveLength(7);
    expect(result.charts.callsPerDay.map((d) => d.count)).toEqual([10, 11, 0, 13, 0, 0, 16]);

    const dates = result.charts.callsPerDay.map((d) => d.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("flattens callLog.groupBy results into {status, count} pairs for statusDistribution", async () => {
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

    // callsTodayCount
    expect(prisma.callLog.count.mock.calls[0][0].where.lead.organizationId).toBe("org-1");
    // revenue aggregate
    expect(prisma.lead.aggregate.mock.calls[0][0].where.organizationId).toBe("org-1");
    // status distribution
    expect(prisma.callLog.groupBy.mock.calls[0][0].where.lead.organizationId).toBe("org-1");
    // lead groupBy
    expect(prisma.lead.groupBy.mock.calls[0][0].where.organizationId).toBe("org-1");
    // recent calls
    expect(prisma.callLog.findMany.mock.calls[0][0].where.lead.organizationId).toBe("org-1");
    // followupsDue scopes via user.organizationId so standalone tasks are included
    const taskCountCall = prisma.task.count.mock.calls[0][0];
    expect(taskCountCall.where.user.organizationId).toBe("org-1");
    expect(taskCountCall.where).not.toHaveProperty("lead");
  });

  it("issues exactly one query per data source (no fanout)", async () => {
    await caller.dashboard.getKpiStats();

    // Previously this procedure ran ~16 queries; the collapsed version
    // should run at most one of each kind.
    expect(prisma.callLog.count).toHaveBeenCalledTimes(1); // callsToday only
    expect(prisma.task.count).toHaveBeenCalledTimes(1); // followups due
    expect(prisma.lead.aggregate).toHaveBeenCalledTimes(1);
    expect(prisma.callLog.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.lead.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.callLog.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1); // 7-day rollup
  });
});
