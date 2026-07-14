import { describe, it, expect, beforeEach } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("dashboardRouter.getKpiStats", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());

    // Default: zero of everything. Individual tests override as needed.
    prisma.activity.count.mockResolvedValue(0);
    prisma.task.count.mockResolvedValue(0);
    prisma.lead.count.mockResolvedValue(0);
    prisma.lead.groupBy.mockResolvedValue([]);
    prisma.activity.findMany.mockResolvedValue([]);
    // 2 $queryRaw calls: touches-per-day, answered-touches-per-day
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

  it("counts calls from touch activities (calls today + prev-7d windows)", async () => {
    // activity.count order: callsToday (idx 0), answeredCallsPrev7d (idx 1), totalCallsPrev7d (idx 2)
    prisma.activity.count
      .mockResolvedValueOnce(3)  // callsToday
      .mockResolvedValueOnce(12) // answeredCallsPrev7d
      .mockResolvedValueOnce(50); // totalCallsPrev7d
    const result = await caller.dashboard.getKpiStats();
    expect(result.callsToday).toBe(3);
    expect(result.answeredCallsPrev7d).toBe(12);
    expect(result.totalCallsPrev7d).toBe(50);

    // Verify answeredCallsPrev7d filter uses outcome: "ANSWERED"
    const answeredCallsWhere = prisma.activity.count.mock.calls[1][0].where;
    expect(answeredCallsWhere.outcome).toBe("ANSWERED");
  });

  it("counts only CALL_OUTCOME activities with a non-NOT_CONTACTED outcome as calls", async () => {
    await caller.dashboard.getKpiStats();
    const where = prisma.activity.count.mock.calls[0][0].where;
    expect(where.type).toBe("CALL_OUTCOME");
    expect(where.outcome).toEqual({ not: "NOT_CONTACTED" });
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
      .mockResolvedValueOnce([]); // connected-calls-per-day

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

  it("maps recent touches to lead identity, outcome, and the user who made the call", async () => {
    prisma.activity.findMany.mockResolvedValue([
      {
        id: "a1",
        outcome: "ANSWERED",
        createdAt: new Date("2026-05-08T10:00:00Z"),
        leadId: "lead-1",
        lead: { id: "lead-1", firstName: "Ada", lastName: "Lovelace", company: "Acme Lawn", phone: "5551234567" },
        user: { name: "Rep One", email: "rep@example.com" },
      },
    ]);

    const result = await caller.dashboard.getKpiStats();
    expect(result.recentCalls[0]).toEqual({
      id: "a1",
      outcome: "ANSWERED",
      createdAt: "2026-05-08T10:00:00.000Z",
      leadId: "lead-1",
      leadName: "Ada Lovelace",
      company: "Acme Lawn",
      userName: "Rep One",
    });
  });

  it("falls back to company for lead name and email for user name on recent touches", async () => {
    prisma.activity.findMany.mockResolvedValue([
      {
        id: "a2",
        outcome: "NO_ANSWER",
        createdAt: new Date("2026-05-08T10:00:00Z"),
        leadId: "lead-2",
        lead: { id: "lead-2", firstName: null, lastName: null, company: "Acme Lawn", phone: null },
        user: { name: null, email: "rep@example.com" },
      },
    ]);

    const result = await caller.dashboard.getKpiStats();
    expect(result.recentCalls[0].leadName).toBe("Acme Lawn");
    expect(result.recentCalls[0].userName).toBe("rep@example.com");
  });

  it("scopes every query to the caller's organizationId", async () => {
    await caller.dashboard.getKpiStats();

    // callsTodayCount
    expect(prisma.activity.count.mock.calls[0][0].where.organizationId).toBe("org-1");
    // answeredCallsPrev7d (second activity.count call)
    expect(prisma.activity.count.mock.calls[1][0].where.organizationId).toBe("org-1");
    // totalCallsPrev7d (third activity.count call)
    expect(prisma.activity.count.mock.calls[2][0].where.organizationId).toBe("org-1");
    // outcome distribution groupBy (first lead.groupBy call)
    expect(prisma.lead.groupBy.mock.calls[0][0].where.organizationId).toBe("org-1");
    // lead status/pipeline groupBy (second lead.groupBy call)
    expect(prisma.lead.groupBy.mock.calls[1][0].where.organizationId).toBe("org-1");
    // recent touches
    expect(prisma.activity.findMany.mock.calls[0][0].where.organizationId).toBe("org-1");
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

    // 3 activity.count: callsToday, answeredCallsPrev7d, totalCallsPrev7d
    expect(prisma.activity.count).toHaveBeenCalledTimes(3);
    expect(prisma.task.count).toHaveBeenCalledTimes(1); // followups due
    expect(prisma.lead.count).toHaveBeenCalledTimes(0); // no longer used for KPIs
    expect(prisma.callLog.count).toHaveBeenCalledTimes(0); // calls come from touches now
    expect(prisma.callLog.findMany).toHaveBeenCalledTimes(0);
    expect(prisma.lead.groupBy).toHaveBeenCalledTimes(2); // outcomeDistribution + leadsByStatus
    expect(prisma.activity.findMany).toHaveBeenCalledTimes(1); // recent touches
    // 2 $queryRaw calls: touches-per-day + answered-touches-per-day
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
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

describe("dashboardRouter.getMyStats", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
    prisma.task.count.mockResolvedValue(0);
    prisma.lead.count.mockResolvedValue(0);
  });

  it("counts my calls today and this week from my touch activities", async () => {
    prisma.activity.count
      .mockResolvedValueOnce(2)  // callsToday
      .mockResolvedValueOnce(9); // callsThisWeek

    const result = await caller.dashboard.getMyStats();

    expect(result.callsToday).toBe(2);
    expect(result.callsThisWeek).toBe(9);
    for (const call of prisma.activity.count.mock.calls.slice(0, 2)) {
      expect(call[0].where.userId).toBe("user-1");
      expect(call[0].where.type).toBe("CALL_OUTCOME");
      expect(call[0].where.outcome).toEqual({ not: "NOT_CONTACTED" });
    }
  });
});

describe("dashboardRouter.getTeamStats", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    ({ caller, prisma } = createTestCaller());
    prisma.lead.count.mockResolvedValue(0);
    prisma.lead.groupBy.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
  });

  it("counts org-wide calls and per-member calls from touch activities", async () => {
    prisma.activity.count
      .mockResolvedValueOnce(100) // totalCalls
      .mockResolvedValueOnce(25); // callsThisWeek
    prisma.activity.groupBy
      .mockResolvedValueOnce([{ userId: "u1", _count: { id: 7 } }]) // memberCallRows
      .mockResolvedValueOnce([]); // memberActivityRows (last active)
    prisma.user.findMany.mockResolvedValue([
      { id: "u1", name: "Rep One", email: "rep@example.com", image: null },
    ]);

    const result = await caller.dashboard.getTeamStats();

    expect(result.totalCalls).toBe(100);
    expect(result.callsThisWeek).toBe(25);
    expect(result.memberStats[0]).toMatchObject({ userId: "u1", callCount: 7 });

    for (const call of prisma.activity.count.mock.calls.slice(0, 2)) {
      expect(call[0].where.organizationId).toBe("org-1");
      expect(call[0].where.type).toBe("CALL_OUTCOME");
      expect(call[0].where.outcome).toEqual({ not: "NOT_CONTACTED" });
    }
    const memberCallGroupBy = prisma.activity.groupBy.mock.calls[0][0];
    expect(memberCallGroupBy.by).toEqual(["userId"]);
    expect(memberCallGroupBy.where.type).toBe("CALL_OUTCOME");
    expect(memberCallGroupBy.where.outcome).toEqual({ not: "NOT_CONTACTED" });
  });
});
