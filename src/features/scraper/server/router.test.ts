import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock runner & importer side-effects before the router (and test harness) is imported.
vi.mock("@/server/scraper/runner", () => ({
  startScraperJob: vi.fn().mockResolvedValue(undefined),
  stopScraperJob: vi.fn().mockResolvedValue(undefined),
  reconcileOrphanedJobs: vi.fn().mockResolvedValue(undefined),
  isJobRunning: vi.fn().mockReturnValue(false),
  deleteScraperOutput: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/scraper/importer", () => ({
  readScrapedCsv: vi.fn().mockResolvedValue([]),
  applyFilter: vi.fn((rows: unknown[]) => rows),
  importRowsToLeads: vi
    .fn()
    .mockResolvedValue({ inserted: 0, skipped: 0, createdLeads: [] }),
}));

// Stub the config so tests run independently of env vars.
// The scraper is enabled here; disabled-by-default behavior is covered in config.test.ts.
vi.mock("@/server/scraper/config", () => ({
  scraperConfig: {
    enabled: true,
    pythonPath: "/usr/bin/python3",
    scriptPath: "/app/scraper.py",
    outputBaseDir: "/tmp/scraper-output",
    maxLogLength: 200_000,
    maxLocations: 50,
    maxLimit: 200,
    maxConcurrency: 4,
  },
  SCRAPER_CATEGORIES: [
    "Mobile Mechanics",
    "Power washing Business",
    "Landscaping",
    "Tree Removal",
    "Cleaning",
    "Concrete",
    "Fencing Companies",
  ],
}));

import { createTestCaller } from "@/test/trpc";
import * as runner from "@/server/scraper/runner";
import * as importer from "@/server/scraper/importer";

describe("scraperRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    vi.clearAllMocks();
    ({ caller, prisma } = createTestCaller());
  });

  describe("config", () => {
    it("exposes the public config fields without leaking internal paths", async () => {
      const cfg = await caller.scraper.config();
      expect(cfg).toMatchObject({
        enabled: expect.any(Boolean),
        maxLocations: expect.any(Number),
        maxLimit: expect.any(Number),
        maxConcurrency: expect.any(Number),
      });
      expect(cfg.categories.length).toBeGreaterThan(0);
      expect(cfg).not.toHaveProperty("pythonPath");
      expect(cfg).not.toHaveProperty("scriptPath");
    });
  });

  describe("list", () => {
    it("scopes to the caller's org and hides lead-map enrichment jobs", async () => {
      prisma.scraperJob.findMany.mockResolvedValue([]);

      await caller.scraper.list();

      const args = prisma.scraperJob.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ organizationId: "org-1", jobType: "SCRAPE" });
      expect(args.take).toBe(50);
    });

    it("deserializes JSON locations/categories", async () => {
      prisma.scraperJob.findMany.mockResolvedValue([
        {
          id: "j1",
          locations: ["Toledo, OH"],
          categories: ["Cleaning"],
        },
      ]);

      const jobs = await caller.scraper.list();
      expect(jobs[0].locations).toEqual(["Toledo, OH"]);
      expect(jobs[0].categories).toEqual(["Cleaning"]);
    });
  });

  describe("getById", () => {
    it("rejects cross-tenant access", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue(null);
      await expect(caller.scraper.getById({ id: "j1" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("annotates the response with isRunning state", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue({
        id: "j1",
        organizationId: "org-1",
        locations: [],
        categories: [],
      });
      vi.mocked(runner.isJobRunning).mockReturnValue(true);

      const job = await caller.scraper.getById({ id: "j1" });
      expect(job.isRunning).toBe(true);
    });
  });

  describe("start", () => {
    it("creates a PENDING job, sanitizes locations, and starts it", async () => {
      prisma.scraperJob.create.mockResolvedValue({ id: "job-1" });

      await caller.scraper.start({
        locations: ["  Toledo,   Ohio "],
        limit: 5,
        concurrency: 1,
        categories: ["Cleaning", "BogusCategory"],
        autoImport: true,
      });

      expect(prisma.scraperJob.create).toHaveBeenCalledTimes(1);
      const data = prisma.scraperJob.create.mock.calls[0][0].data;
      expect(data.locations).toEqual(["Toledo, Ohio"]);
      // Bogus category gets dropped
      expect(data.categories).toEqual(["Cleaning"]);
      expect(data.organizationId).toBe("org-1");
      expect(data.userId).toBe("user-1");
      expect(data.status).toBe("PENDING");
      expect(runner.startScraperJob).toHaveBeenCalledWith("job-1");
    });

    it("rejects locations containing shell metacharacters", async () => {
      await expect(
        caller.scraper.start({
          locations: ["Toledo; rm -rf /"],
          limit: 5,
          concurrency: 1,
          autoImport: true,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(prisma.scraperJob.create).not.toHaveBeenCalled();
    });

    it("marks the job FAILED and rethrows when the runner errors", async () => {
      prisma.scraperJob.create.mockResolvedValue({ id: "job-1" });
      vi.mocked(runner.startScraperJob).mockRejectedValueOnce(new Error("boom"));
      prisma.scraperJob.update.mockResolvedValue({ id: "job-1" });

      await expect(
        caller.scraper.start({
          locations: ["Toledo, OH"],
          limit: 5,
          concurrency: 1,
          autoImport: true,
        })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

      expect(prisma.scraperJob.update).toHaveBeenCalledWith({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "FAILED",
          error: "boom",
        }),
      });
    });

    it("enforces the maxLocations limit", async () => {
      const tooMany = Array.from({ length: 51 }, (_, i) => `City ${i}, OH`);
      await expect(
        caller.scraper.start({
          locations: tooMany,
          limit: 5,
          concurrency: 1,
          autoImport: true,
        })
      ).rejects.toThrow();
    });
  });

  describe("stop", () => {
    it("returns a noop message when the job is not running", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue({ id: "j1", status: "COMPLETED" });

      const res = await caller.scraper.stop({ id: "j1" });
      expect(res).toMatchObject({ ok: true });
      expect(runner.stopScraperJob).not.toHaveBeenCalled();
    });

    it("calls stopScraperJob when the job is running", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue({ id: "j1", status: "RUNNING" });

      await caller.scraper.stop({ id: "j1" });
      expect(runner.stopScraperJob).toHaveBeenCalledWith("j1");
    });

    it("refuses cross-tenant access", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue(null);
      await expect(caller.scraper.stop({ id: "j1" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("delete", () => {
    it("refuses to delete a RUNNING job", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue({ id: "j1", status: "RUNNING" });

      await expect(caller.scraper.delete({ id: "j1" })).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      expect(prisma.scraperJob.delete).not.toHaveBeenCalled();
    });

    it("deletes a finished job and its output directory", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue({ id: "j1", status: "COMPLETED", outputDir: "/tmp/scraper-output/j1" });
      prisma.scraperJob.delete.mockResolvedValue({ id: "j1" });

      await caller.scraper.delete({ id: "j1" });
      expect(runner.deleteScraperOutput).toHaveBeenCalledWith("j1", "/tmp/scraper-output/j1");
      expect(prisma.scraperJob.delete).toHaveBeenCalledWith({ where: { id: "j1" } });
    });
  });

  describe("importResults", () => {
    it("requires the job to have an outputDir", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue({ id: "j1", outputDir: null });

      await expect(caller.scraper.importResults({ id: "j1" })).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
    });

    it("reads, filters, and imports CSV rows", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue({
        id: "j1",
        outputDir: "/tmp/j1",
      });
      vi.mocked(importer.readScrapedCsv).mockResolvedValue([
        { Name: "A" },
        { Name: "B" },
      ]);
      vi.mocked(importer.importRowsToLeads).mockResolvedValue({
        inserted: 2,
        skipped: 0,
        createdLeads: [
          { id: "lead-1", email: "a@example.com" },
          { id: "lead-2", email: null },
        ],
      });

      const result = await caller.scraper.importResults({ id: "j1" });

      expect(importer.readScrapedCsv).toHaveBeenCalledWith("/tmp/j1");
      expect(importer.importRowsToLeads).toHaveBeenCalledWith({
        rows: [{ Name: "A" }, { Name: "B" }],
        organizationId: "org-1",
        assignedToId: "user-1",
        jobId: "j1",
      });
      expect(result).toEqual({ inserted: 2, skipped: 0, considered: 2, total: 2 });
    });
  });

  describe("previewResults", () => {
    it("returns at most 200 rows", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue({ outputDir: "/tmp/j1" });
      vi.mocked(importer.readScrapedCsv).mockResolvedValue(
        Array.from({ length: 500 }, (_, i) => ({ Name: `R${i}` }))
      );

      const result = await caller.scraper.previewResults({ id: "j1" });
      expect(result.rows).toHaveLength(200);
    });

    it("returns an empty array if the job has no outputDir", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue({ outputDir: null });
      const result = await caller.scraper.previewResults({ id: "j1" });
      expect(result.rows).toEqual([]);
    });
  });

  describe("createCategory", () => {
    it("creates a new org category", async () => {
      prisma.orgScraperCategory.count.mockResolvedValue(0);
      prisma.orgScraperCategory.create.mockResolvedValue({ id: "cat-1", name: "Pest Control", organizationId: "org-1" });

      const result = await caller.scraper.createCategory({ name: "Pest Control" });

      expect(prisma.orgScraperCategory.create).toHaveBeenCalledWith({
        data: { name: "Pest Control", organizationId: "org-1" },
      });
      expect(result.id).toBe("cat-1");
    });

    it("rejects when the org already has 50 categories", async () => {
      prisma.orgScraperCategory.count.mockResolvedValue(50);

      await expect(caller.scraper.createCategory({ name: "New Cat" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(prisma.orgScraperCategory.create).not.toHaveBeenCalled();
    });
  });

  describe("deleteCategory", () => {
    it("deletes an existing org category", async () => {
      prisma.orgScraperCategory.findFirst.mockResolvedValue({ id: "cat-1", name: "Pest Control", organizationId: "org-1" });
      prisma.orgScraperCategory.delete.mockResolvedValue({ id: "cat-1" });

      const result = await caller.scraper.deleteCategory({ id: "cat-1" });

      expect(prisma.orgScraperCategory.delete).toHaveBeenCalledWith({ where: { id: "cat-1" } });
      expect(result).toEqual({ ok: true });
    });

    it("throws NOT_FOUND for a category from another org", async () => {
      prisma.orgScraperCategory.findFirst.mockResolvedValue(null);

      await expect(caller.scraper.deleteCategory({ id: "cat-other" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(prisma.orgScraperCategory.delete).not.toHaveBeenCalled();
    });
  });
});
