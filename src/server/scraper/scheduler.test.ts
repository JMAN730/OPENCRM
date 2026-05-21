import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockFindManySchedules,
  mockUpdateSchedule,
  mockFindFirstUser,
  mockCreateJob,
} = vi.hoisted(() => ({
  mockFindManySchedules: vi.fn(),
  mockUpdateSchedule: vi.fn().mockResolvedValue({}),
  mockFindFirstUser: vi.fn(),
  mockCreateJob: vi.fn(),
}));

const mockStartScraperJob = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    scheduledScrape: {
      findMany: mockFindManySchedules,
      update: mockUpdateSchedule,
    },
    user: {
      findFirst: mockFindFirstUser,
    },
    scraperJob: {
      create: mockCreateJob,
    },
  },
}));

vi.mock("./runner", () => ({
  startScraperJob: mockStartScraperJob,
}));

import { runDueSchedules } from "./scheduler";

const FIXED_NOW = new Date("2026-05-20T12:00:00.000Z");

function makeSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: "sched-1",
    organizationId: "org-1",
    locations: ["Tampa, FL"],
    categories: [] as string[],
    limit: 20,
    concurrency: 1,
    dayOfWeek: 1,
    hourOfDay: 8,
    autoImport: true,
    enabled: true,
    lastRunAt: null,
    nextRunAt: new Date("2026-05-19T08:00:00Z"),
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

describe("runDueSchedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zero counts when no schedules are due", async () => {
    mockFindManySchedules.mockResolvedValue([]);

    const result = await runDueSchedules();

    expect(result).toEqual({ triggered: 0, skipped: 0 });
    expect(mockFindFirstUser).not.toHaveBeenCalled();
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  it("queries only enabled schedules with nextRunAt lte now", async () => {
    mockFindManySchedules.mockResolvedValue([]);

    await runDueSchedules();

    expect(mockFindManySchedules).toHaveBeenCalledWith({
      where: { enabled: true, nextRunAt: { lte: FIXED_NOW } },
      orderBy: { nextRunAt: "asc" },
      take: 20,
    });
  });

  it("creates and starts a job for a due schedule", async () => {
    mockFindManySchedules.mockResolvedValue([makeSchedule()]);
    mockFindFirstUser.mockResolvedValue({ id: "admin-1" });
    mockCreateJob.mockResolvedValue({ id: "job-new" });

    const result = await runDueSchedules();

    expect(result).toEqual({ triggered: 1, skipped: 0 });
    expect(mockCreateJob).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        userId: "admin-1",
        locations: ["Tampa, FL"],
        categories: [],
        limit: 20,
        concurrency: 1,
        autoImport: true,
        status: "PENDING",
      },
    });
    expect(mockStartScraperJob).toHaveBeenCalledWith("job-new");
  });

  it("looks up the oldest admin in the org as the job initiator", async () => {
    mockFindManySchedules.mockResolvedValue([makeSchedule()]);
    mockFindFirstUser.mockResolvedValue({ id: "admin-1" });
    mockCreateJob.mockResolvedValue({ id: "job-new" });

    await runDueSchedules();

    expect(mockFindFirstUser).toHaveBeenCalledWith({
      where: { organizationId: "org-1", role: "ADMIN" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("updates lastRunAt and a future nextRunAt on success", async () => {
    mockFindManySchedules.mockResolvedValue([makeSchedule()]);
    mockFindFirstUser.mockResolvedValue({ id: "admin-1" });
    mockCreateJob.mockResolvedValue({ id: "job-new" });

    await runDueSchedules();

    expect(mockUpdateSchedule).toHaveBeenCalledWith({
      where: { id: "sched-1" },
      data: {
        lastRunAt: FIXED_NOW,
        nextRunAt: expect.any(Date),
      },
    });
    const nextRunAt = mockUpdateSchedule.mock.calls[0][0].data.nextRunAt as Date;
    expect(nextRunAt.getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });

  it("skips a schedule whose locations array is empty", async () => {
    mockFindManySchedules.mockResolvedValue([makeSchedule({ locations: [] })]);

    const result = await runDueSchedules();

    expect(result).toEqual({ triggered: 0, skipped: 1 });
    expect(mockFindFirstUser).not.toHaveBeenCalled();
    expect(mockCreateJob).not.toHaveBeenCalled();
    expect(mockUpdateSchedule).not.toHaveBeenCalled();
  });

  it("skips a schedule when no admin user exists for the org", async () => {
    mockFindManySchedules.mockResolvedValue([makeSchedule()]);
    mockFindFirstUser.mockResolvedValue(null);

    const result = await runDueSchedules();

    expect(result).toEqual({ triggered: 0, skipped: 1 });
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  it("skips and advances nextRunAt when startScraperJob throws", async () => {
    mockFindManySchedules.mockResolvedValue([makeSchedule()]);
    mockFindFirstUser.mockResolvedValue({ id: "admin-1" });
    mockCreateJob.mockResolvedValue({ id: "job-new" });
    mockStartScraperJob.mockRejectedValueOnce(new Error("python not found"));

    const result = await runDueSchedules();

    expect(result).toEqual({ triggered: 0, skipped: 1 });
    expect(mockUpdateSchedule).toHaveBeenCalledWith({
      where: { id: "sched-1" },
      data: { nextRunAt: expect.any(Date) },
    });
    // lastRunAt must NOT be set on failure
    expect(mockUpdateSchedule.mock.calls[0][0].data).not.toHaveProperty("lastRunAt");
  });

  it("processes multiple due schedules independently", async () => {
    const schedOk = makeSchedule({ id: "sched-ok" });
    const schedNoLoc = makeSchedule({ id: "sched-no-loc", locations: [] });
    const schedNoAdmin = makeSchedule({ id: "sched-no-admin", organizationId: "org-2" });

    mockFindManySchedules.mockResolvedValue([schedOk, schedNoLoc, schedNoAdmin]);
    mockFindFirstUser
      .mockResolvedValueOnce({ id: "admin-1" })  // for sched-ok
      .mockResolvedValueOnce(null);               // for sched-no-admin
    mockCreateJob.mockResolvedValue({ id: "job-ok" });

    const result = await runDueSchedules();

    expect(result).toEqual({ triggered: 1, skipped: 2 });
    expect(mockCreateJob).toHaveBeenCalledTimes(1);
    expect(mockStartScraperJob).toHaveBeenCalledTimes(1);
  });

  it("parses locations stored as a JSON string", async () => {
    const schedule = makeSchedule({ locations: JSON.stringify(["Orlando, FL", "Miami, FL"]) });
    mockFindManySchedules.mockResolvedValue([schedule]);
    mockFindFirstUser.mockResolvedValue({ id: "admin-1" });
    mockCreateJob.mockResolvedValue({ id: "job-new" });

    await runDueSchedules();

    expect(mockCreateJob).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ locations: ["Orlando, FL", "Miami, FL"] }),
      }),
    );
  });
});
