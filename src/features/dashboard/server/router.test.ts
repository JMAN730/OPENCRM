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
    prisma.lead.count.mockResolvedValue(0);
    prisma.callLog.groupBy.mockResolvedValue([]);
    prisma.lead.groupBy.mockResolvedValue([]);
    prisma.callLog.findMany.mockResolvedValue([]);
    // 3 $queryRaw calls: calls-per-day, connected-calls-per-day, leads-per-week
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
      { status: "NOT_CONTACTED", callOutcome: "NOT_CONTACTED", _count: { id: 150 } },
      { status: "CONNECTED", callOutcome: "ANSWERED", _count: { id: 50 } },
    ]);

    const result = await caller.dashboard.getKpiStats();

    expect(result.totalLeads).toBe(200);
    expect(result.qualifiedLeads).toBe(50);
    expect(result.conversionRate).toBe("25.0%");
  });

  it("returns connected calls in last 7d from callLog.count", async () => {
    // callLog.count order: callsToday (idx 0), connectedCallsPrev7d (idx 1), totalCallsPrev7d (idx 2)
    prisma.callLog.count
      .mockResolvedValueOnce(3)  // callsToday
      .mockResolvedValueOnce(12) // connectedCallsPrev7d
      .mockResolvedValueOnce(50); // totalCallsPrev7d
    const result = await caller.dashboard.getKpiStats();
    expect(result.callsToday).toBe(3);
    expect(result.connectedCallsPrev7d).toBe(12);
    expect(result.totalCallsPrev7d).toBe(50);
  });

  it("excludes custom call outcomes from generic connected dashboard metrics", async () => {
    prisma.lead.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { status: "CONNECTED", callOutcome: "ANSWERED", _count: { id: 7 } },
        { status: "CONNECTED", callOutcome: "CUSTOM", _count: { id: 3 } },
        { status: "NO_ANSWER", callOutcome: "NO_ANSWER", _count: { id: 5 } },
      ]);

    const result = await caller.dashboard.getKpiStats();

    expect(prisma.lead.groupBy.mock.calls[1][0].by).toEqual(["status", "callOutcome"]);
    expect(result.totalLeads).toBe(15);
    expect(result.qualifiedLeads).toBe(7);
    expect(result.conversionRate).toBe("46.7%");
    expect(result.leadsByStatus).toEqual([
      { status: "CONNECTED", count: 7 },
      { status: "NO_ANSWER", count: 5 },
    ]);
  });

  it("returns 7 daily call buckets in chronological order, filling missing days with 0", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOf = (offset: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() - offset);
      return d;
    };

    // $queryRaw order: calls-per-day, connected-calls-per-day, leads-per-week
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { day: dayOf(6), count: BigInt(10) },
        { day: dayOf(5), count: BigInt(11) },
        // -4 missing → expect 0
        { day: dayOf(3), count: BigInt(13) },
        { day: dayOf(0), count: BigInt(16) },
      ])
      .mockResolvedValueOnce([]) // connected-calls-per-day
      .mockResolvedValueOnce([]); // leads-per-week

    const result = await caller.dashboard.getKpiStats();

    expect(result.charts.callsPerDay).toHaveLength(7);
    expect(result.charts.callsPerDay.map((d) => d.count)).toEqual([10, 11, 0, 13, 0, 0, 16]);

    const dates = result.charts.callsPerDay.map((d) => d.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("flattens lead.groupBy callOutcome results into {outcome, count} pairs for outcomeDistribution", async () => {
    // Promise.all order: outcomeDistribution (by callOutcome) is called before
    // leadsByStatusResult (by status, callOutcome).
    prisma.lead.groupBy
      .mockResolvedValueOnce([
        { callOutcome: "ANSWERED", _count: { id: 7 } },
        { callOutcome: "NO_ANSWER", _count: { id: 2 } },
      ]) // first call: outcomeDistribution
      .mockResolvedValueOnce([]); // second call: leadsByStatusResult

    const result = await caller.dashboard.getKpiStats();
    expect(result.charts.outcomeDistribution).toEqual([
      { outcome: "ANSWERED", count: 7 },
      { outcome: "NO_ANSWER", count: 2 },
    ]);
  });

  it("substitutes 'Unknown' when a recent call's lead has no phone", async () => {
    prisma.callLog.findMany.mockResolvedValue([
      {
        id: "c1",
        status: "CONNECTED",
        duration: 60,
        createdAt: new Date("2026-05-08T10:00:00Z"),
        lead: { phone: null, callOutcome: "ANSWERED" },
      },
    ]);

    const result = await caller.dashboard.getKpiStats();
    expect(result.recentCalls[0]).toEqual({
      id: "c1",
      status: "CONNECTED",
      callOutcome: "ANSWERED",
      duration: 60,
      createdAt: "2026-05-08T10:00:00.000Z",
      phone: "Unknown",
    });
  });

  it("scopes every query to the caller's organizationId", async () => {
    await caller.dashboard.getKpiStats();

    // callsTodayCount
    expect(prisma.callLog.count.mock.calls[0][0].where.lead.organizationId).toBe("org-1");
    // connectedCallsPrev7d (second callLog.count call)
    expect(prisma.callLog.count.mock.calls[1][0].where.lead.organizationId).toBe("org-1");
    // outcome distribution groupBy (first lead.groupBy call)
    expect(prisma.lead.groupBy.mock.calls[0][0].where.organizationId).toBe("org-1");
    // lead status/pipeline groupBy (second lead.groupBy call)
    expect(prisma.lead.groupBy.mock.calls[1][0].where.organizationId).toBe("org-1");
    // recent calls
    expect(prisma.callLog.findMany.mock.calls[0][0].where.lead.organizationId).toBe("org-1");
    // followupsDue uses direct organizationId on Task (non-nullable since 2026-05-17)
    const taskCountCall = prisma.task.count.mock.calls[0][0];
    expect(taskCountCall.where.organizationId).toBe("org-1");
    expect(taskCountCall.where.deletedAt).toBeNull();
  });

  it("excludes soft-deleted tasks from followupsDue count", async () => {
    await caller.dashboard.getKpiStats();
    const taskCountCall = prisma.task.count.mock.calls[0][0];
    expect(taskCountCall.where.deletedAt).toBeNull();
  });

  it("issues exactly one query per data source (no fanout)", async () => {
    await caller.dashboard.getKpiStats();

    // 3 callLog.count: callsToday, connectedCallsPrev7d, totalCallsPrev7d
    expect(prisma.callLog.count).toHaveBeenCalledTimes(3);
    expect(prisma.task.count).toHaveBeenCalledTimes(1); // followups due
    expect(prisma.lead.count).toHaveBeenCalledTimes(0); // no longer used for KPIs
    expect(prisma.callLog.groupBy).toHaveBeenCalledTimes(0); // no longer used
    expect(prisma.lead.groupBy).toHaveBeenCalledTimes(2); // outcomeDistribution + leadsByStatus
    expect(prisma.callLog.findMany).toHaveBeenCalledTimes(1);
    // 3 $queryRaw calls: calls-per-day + connected-calls-per-day + leads-per-week
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
  });
});

describe("dashboardRouter.getMyPhoneReach", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
    prisma.lead.groupBy.mockResolvedValue([]);
  });

  it("returns empty array when user has no organizationId", async () => {
    const { caller: orphan } = createTestCaller({
      sessionOverrides: { organizationId: null },
    });
    const result = await orphan.dashboard.getMyPhoneReach();
    expect(result).toEqual([]);
  });

  it("maps groupBy results to {outcome, count} pairs", async () => {
    prisma.lead.groupBy
      .mockResolvedValueOnce([
        { callOutcome: "ANSWERED", _count: { id: 5 } },
        { callOutcome: "NO_ANSWER", _count: { id: 3 } },
      ])
      .mockResolvedValueOnce([]);
    const result = await caller.dashboard.getMyPhoneReach();
    expect(result).toEqual([
      { outcome: "ANSWERED", count: 5 },
      { outcome: "NO_ANSWER", count: 3 },
    ]);
  });

  it("scopes query to the caller's userId and organizationId, excluding NOT_CONTACTED", async () => {
    await caller.dashboard.getMyPhoneReach();
    const callArgs = prisma.lead.groupBy.mock.calls[0][0];
    expect(callArgs.where.organizationId).toBe("org-1");
    expect(callArgs.where.assignedToId).toBe("user-1");
    expect(callArgs.where.callOutcome).toEqual({ notIn: ["NOT_CONTACTED", "CUSTOM"] });
  });
});
