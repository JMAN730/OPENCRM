import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestCaller } from "@/test/trpc";
import { fetchOverpass, geocodeCityState } from "./osm";
import { writeEnrichInput } from "./enrich";
import { startEnrichmentJob } from "@/server/scraper/runner";
import { scraperConfig } from "@/server/scraper/config";

vi.mock("@/server/scraper/config", () => ({
  scraperConfig: {
    pythonPath: "/usr/bin/python3",
    scriptPath: "/app/scraper.py",
    outputBaseDir: "/tmp/scraper-output-test",
    enabled: true,
    maxLogLength: 200_000,
    maxLocations: 50,
    maxLimit: 200,
    maxConcurrency: 4,
  },
  SCRAPER_CATEGORIES: ["Mobile Mechanics"],
}));

vi.mock("@/server/scraper/runner", () => ({
  startScraperJob: vi.fn(),
  stopScraperJob: vi.fn(),
  startEnrichmentJob: vi.fn().mockResolvedValue(undefined),
  isJobRunning: vi.fn().mockReturnValue(false),
  deleteScraperOutput: vi.fn(),
  initializeScraperWorker: vi.fn(),
  reconcileOrphanedJobs: vi.fn(),
}));

vi.mock("./osm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./osm")>();
  return {
    ...actual,
    fetchOverpass: vi.fn(),
    geocodeCityState: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("./enrich", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./enrich")>();
  return {
    ...actual,
    writeEnrichInput: vi.fn().mockResolvedValue(undefined),
  };
});

const BOUNDS = { south: 30.2, west: -97.8, north: 30.3, east: -97.7 };

describe("mapRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(startEnrichmentJob).mockResolvedValue(undefined);
    scraperConfig.enabled = true;
    ({ caller, prisma } = createTestCaller());
  });

  describe("leadsInBounds", () => {
    it("filters by organization and the bounding box", async () => {
      prisma.lead.findMany.mockResolvedValue([]);

      await caller.map.leadsInBounds({ bounds: BOUNDS });

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.organizationId).toBe("org-1");
      expect(args.where.latitude).toEqual({ gte: BOUNDS.south, lte: BOUNDS.north });
      expect(args.where.longitude).toEqual({ gte: BOUNDS.west, lte: BOUNDS.east });
      expect(args.take).toBe(1000);
    });

    it("restricts non-admin users to their own assigned leads", async () => {
      ({ caller, prisma } = createTestCaller({ sessionOverrides: { role: "USER" } }));
      prisma.team.findMany.mockResolvedValue([]);
      prisma.lead.findMany.mockResolvedValue([]);

      await caller.map.leadsInBounds({ bounds: BOUNDS });

      const args = prisma.lead.findMany.mock.calls[0][0];
      expect(args.where.assignedToId).toEqual({ in: ["user-1"] });
    });

    it("rejects an inverted bounding box", async () => {
      await expect(
        caller.map.leadsInBounds({
          bounds: { south: 31, west: -97.8, north: 30, east: -97.7 },
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  describe("discoverBusinesses", () => {
    it("rejects unknown categories", async () => {
      await expect(
        caller.map.discoverBusinesses({ bounds: BOUNDS, category: "Nope" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects bounding boxes that are too large", async () => {
      await expect(
        caller.map.discoverBusinesses({
          bounds: { south: 20, west: -100, north: 40, east: -80 },
          category: "Auto Repair",
        }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });

    it("returns Overpass results flagged with existing lead matches", async () => {
      vi.mocked(fetchOverpass).mockResolvedValue([
        {
          osmType: "node",
          osmId: 1,
          name: "Austin Auto Care",
          lat: 30.25,
          lng: -97.75,
          phone: "+1 512-555-1234",
        },
        { osmType: "node", osmId: 2, name: "Fresh Wrench", lat: 30.26, lng: -97.74 },
      ]);
      prisma.lead.findMany.mockResolvedValue([
        { id: "lead-9", phone: "(512) 555-1234", company: "Some Other Shop" },
      ]);

      const res = await caller.map.discoverBusinesses({
        bounds: BOUNDS,
        category: "Auto Repair",
      });

      expect(res.items).toHaveLength(2);
      expect(res.items[0].existingLeadId).toBe("lead-9");
      expect(res.items[1].existingLeadId).toBeUndefined();
    });

    it("matches existing leads case-insensitively by company name", async () => {
      vi.mocked(fetchOverpass).mockResolvedValue([
        { osmType: "way", osmId: 3, name: "The Corner Cafe", lat: 30.25, lng: -97.75 },
      ]);
      prisma.lead.findMany.mockResolvedValue([
        { id: "lead-5", phone: null, company: "the corner cafe" },
      ]);

      const res = await caller.map.discoverBusinesses({
        bounds: BOUNDS,
        category: "Cafes",
      });

      expect(res.items[0].existingLeadId).toBe("lead-5");
    });

    it("surfaces Overpass failures as a retryable error", async () => {
      vi.mocked(fetchOverpass).mockRejectedValue(new Error("timeout"));
      await expect(
        caller.map.discoverBusinesses({ bounds: BOUNDS, category: "Auto Repair" }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
  });

  describe("geocodeMissing", () => {
    it("fills coordinates from stored Maps URLs without calling Nominatim", async () => {
      prisma.lead.findMany
        .mockResolvedValueOnce([
          { id: "lead-1", mapsUrl: "https://maps.google.com/place/x!3d30.1!4d-97.7" },
          { id: "lead-2", mapsUrl: "https://maps.google.com/search/no-coords" },
        ])
        .mockResolvedValueOnce([]);
      prisma.lead.update.mockResolvedValue({});
      prisma.lead.count.mockResolvedValue(1);

      const res = await caller.map.geocodeMissing();

      expect(res).toEqual({ fromMapsUrl: 1, geocoded: 0, remaining: 1 });
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: "lead-1" },
        data: { latitude: 30.1, longitude: -97.7 },
      });
      expect(geocodeCityState).not.toHaveBeenCalled();
    });

    it("geocodes distinct city/state pairs and updates all their leads", async () => {
      prisma.lead.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ city: "Austin", state: "TX" }]);
      vi.mocked(geocodeCityState).mockResolvedValue({ lat: 30.2672, lng: -97.7431 });
      prisma.lead.updateMany.mockResolvedValue({ count: 3 });
      prisma.lead.count.mockResolvedValue(0);

      const res = await caller.map.geocodeMissing();

      expect(res).toEqual({ fromMapsUrl: 0, geocoded: 3, remaining: 0 });
      expect(geocodeCityState).toHaveBeenCalledWith("Austin", "TX");
      const updateArgs = prisma.lead.updateMany.mock.calls[0][0];
      expect(updateArgs.where).toMatchObject({
        organizationId: "org-1",
        latitude: null,
        city: "Austin",
        state: "TX",
      });
      expect(updateArgs.data).toEqual({ latitude: 30.2672, longitude: -97.7431 });
    });

    it("skips pairs whose geocode lookup fails and keeps going", async () => {
      prisma.lead.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { city: "Nowhere", state: "ZZ" },
          { city: "Austin", state: "TX" },
        ]);
      vi.mocked(geocodeCityState)
        .mockRejectedValueOnce(new Error("nominatim down"))
        .mockResolvedValueOnce({ lat: 30.2672, lng: -97.7431 });
      prisma.lead.updateMany.mockResolvedValue({ count: 2 });
      prisma.lead.count.mockResolvedValue(5);

      const res = await caller.map.geocodeMissing();

      expect(res).toEqual({ fromMapsUrl: 0, geocoded: 2, remaining: 5 });
    });
  });

  describe("enrich", () => {
    it("rejects an empty selection", async () => {
      await expect(caller.map.enrich({ leadIds: [], osmBusinesses: [] })).rejects.toMatchObject(
        { code: "BAD_REQUEST" },
      );
    });

    it("fails when the scraper feature is disabled", async () => {
      scraperConfig.enabled = false;
      await expect(
        caller.map.enrich({ leadIds: ["lead-1"], osmBusinesses: [] }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });

    it("rejects lead ids outside the caller's scope", async () => {
      prisma.lead.findMany.mockResolvedValueOnce([]); // scope query finds none of them

      await expect(
        caller.map.enrich({ leadIds: ["foreign-lead"], osmBusinesses: [] }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("creates leads for new OSM businesses and starts an ENRICH job", async () => {
      prisma.lead.findMany
        .mockResolvedValueOnce([]) // scoped leads (none selected)
        .mockResolvedValueOnce([]); // name-dedup lookup
      prisma.lead.createManyAndReturn.mockResolvedValue([
        { id: "lead-new", company: "Fresh Wrench", phone: "512", website: null },
      ]);
      prisma.scraperJob.create.mockResolvedValue({ id: "job-1" });

      const res = await caller.map.enrich({
        leadIds: [],
        osmBusinesses: [
          { osmType: "node", osmId: 2, name: "Fresh Wrench", lat: 30.26, lng: -97.74, phone: "512" },
        ],
        category: "Auto Repair",
      });

      expect(res).toEqual({ jobId: "job-1", createdLeads: 1, dedupedLeads: 0 });
      const createArgs = prisma.lead.createManyAndReturn.mock.calls[0][0];
      expect(createArgs.data[0]).toMatchObject({
        company: "Fresh Wrench",
        organizationId: "org-1",
        latitude: 30.26,
        longitude: -97.74,
        source: "OpenStreetMap / Auto Repair",
      });
      const jobArgs = prisma.scraperJob.create.mock.calls[0][0];
      expect(jobArgs.data).toMatchObject({ jobType: "ENRICH", autoImport: false });
      expect(writeEnrichInput).toHaveBeenCalledWith(
        expect.stringContaining("job-1"),
        [expect.objectContaining({ leadId: "lead-new", name: "Fresh Wrench" })],
      );
      expect(startEnrichmentJob).toHaveBeenCalledWith("job-1");
    });

    it("dedupes OSM businesses onto existing leads instead of creating duplicates", async () => {
      prisma.lead.findMany
        .mockResolvedValueOnce([]) // scoped leads
        .mockResolvedValueOnce([{ id: "lead-9", company: "Fresh Wrench", phone: "512" }]);
      prisma.scraperJob.create.mockResolvedValue({ id: "job-2" });

      const res = await caller.map.enrich({
        leadIds: [],
        osmBusinesses: [
          { osmType: "node", osmId: 2, name: "fresh wrench", lat: 30.26, lng: -97.74 },
        ],
      });

      expect(res).toEqual({ jobId: "job-2", createdLeads: 0, dedupedLeads: 1 });
      expect(prisma.lead.createManyAndReturn).not.toHaveBeenCalled();
      expect(writeEnrichInput).toHaveBeenCalledWith(
        expect.stringContaining("job-2"),
        [expect.objectContaining({ leadId: "lead-9" })],
      );
    });

    it("marks the job FAILED when the enrichment process cannot start", async () => {
      prisma.lead.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.lead.createManyAndReturn.mockResolvedValue([
        { id: "lead-new", company: "Fresh Wrench", phone: null, website: null },
      ]);
      prisma.scraperJob.create.mockResolvedValue({ id: "job-3" });
      vi.mocked(startEnrichmentJob).mockRejectedValue(new Error("python not found"));

      await expect(
        caller.map.enrich({
          leadIds: [],
          osmBusinesses: [
            { osmType: "node", osmId: 2, name: "Fresh Wrench", lat: 30.26, lng: -97.74 },
          ],
        }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

      expect(prisma.scraperJob.update).toHaveBeenCalledWith({
        where: { id: "job-3" },
        data: expect.objectContaining({ status: "FAILED", error: "python not found" }),
      });
    });
  });

  describe("enrichmentStatus", () => {
    it("scopes the lookup to the organization and ENRICH jobs", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue({
        status: "RUNNING",
        totalQueries: 4,
        completedQueries: 1,
        failedQueries: 0,
        error: null,
        completedAt: null,
      });

      const res = await caller.map.enrichmentStatus({ jobId: "job-1" });

      expect(res.status).toBe("RUNNING");
      const args = prisma.scraperJob.findFirst.mock.calls[0][0];
      expect(args.where).toEqual({
        id: "job-1",
        organizationId: "org-1",
        jobType: "ENRICH",
      });
    });

    it("throws NOT_FOUND for jobs outside the org", async () => {
      prisma.scraperJob.findFirst.mockResolvedValue(null);
      await expect(caller.map.enrichmentStatus({ jobId: "job-x" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});
