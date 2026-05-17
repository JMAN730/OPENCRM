import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";

const { mockUpdateMany, mockRm } = vi.hoisted(() => ({
  mockUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
  mockRm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    scraperJob: {
      updateMany: mockUpdateMany,
    },
  },
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  const mocked = { ...actual, rm: mockRm };
  return { ...mocked, default: mocked };
});

import { reconcileOrphanedJobs, deleteScraperOutput } from "./runner";
import { scraperConfig } from "./config";

describe("reconcileOrphanedJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks RUNNING jobs with no heartbeat in the past 2 minutes as FAILED", async () => {
    await reconcileOrphanedJobs();

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        status: "RUNNING",
        OR: [
          { lastHeartbeatAt: null },
          { lastHeartbeatAt: { lt: new Date("2026-05-17T11:58:00.000Z") } },
        ],
      },
      data: {
        status: "FAILED",
        error: "Scraper worker stopped reporting heartbeats.",
        completedAt: expect.any(Date),
        workerId: null,
        workerPid: null,
      },
    });
  });

  it("uses a 2-minute staleness threshold (not in-memory registry)", async () => {
    await reconcileOrphanedJobs();

    const where = mockUpdateMany.mock.calls[0][0].where;
    const staleCutoff = where.OR[1].lastHeartbeatAt.lt as Date;
    const nowMs = new Date("2026-05-17T12:00:00.000Z").getTime();
    expect(nowMs - staleCutoff.getTime()).toBe(2 * 60 * 1000);
  });
});

describe("deleteScraperOutput", () => {
  // Derive paths from the actual config so the guard comparison always matches,
  // regardless of env-var overrides in CI.
  const base = scraperConfig.outputBaseDir;
  const validDir = path.join(base, "job-abc");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes the job output directory when it is a direct child of outputBaseDir", async () => {
    await deleteScraperOutput("job-abc", validDir);
    expect(mockRm).toHaveBeenCalledWith(path.resolve(validDir), { recursive: true, force: true });
  });

  it("falls back to the derived path when outputDir is null", async () => {
    await deleteScraperOutput("job-abc", null);
    expect(mockRm).toHaveBeenCalledWith(path.resolve(validDir), { recursive: true, force: true });
  });

  it("refuses to delete a path outside outputBaseDir (traversal guard)", async () => {
    await deleteScraperOutput("job-abc", path.join(base, "..", "etc"));
    expect(mockRm).not.toHaveBeenCalled();
  });

  it("refuses to delete an unrelated absolute path", async () => {
    await deleteScraperOutput("job-abc", "/etc/passwd");
    expect(mockRm).not.toHaveBeenCalled();
  });
});
