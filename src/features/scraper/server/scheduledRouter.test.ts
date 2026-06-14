import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("scheduledScraperRouter", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => {
    vi.clearAllMocks();
    ({ caller, prisma } = createTestCaller());
  });

  describe("list", () => {
    it("returns scheduled scrapes for the caller org", async () => {
      const raw = {
        id: "sched-1",
        organizationId: "org-1",
        locations: ["Tampa, FL"],
        categories: ["Cleaning"],
        limit: 20,
        concurrency: 1,
        dayOfWeek: 1,
        hourOfDay: 8,
        autoImport: true,
        enabled: true,
        lastRunAt: null,
        nextRunAt: new Date("2026-06-02T08:00:00Z"),
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      };
      prisma.scheduledScrape.findMany.mockResolvedValue([raw]);

      const result = await caller.scraperSchedules.list();

      expect(prisma.scheduledScrape.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].locations).toEqual(["Tampa, FL"]);
      expect(result[0].categories).toEqual(["Cleaning"]);
    });
  });

  describe("create", () => {
    it("creates a new scheduled scrape with a computed nextRunAt", async () => {
      prisma.scheduledScrape.count.mockResolvedValue(0);
      const created = {
        id: "sched-new",
        organizationId: "org-1",
        locations: ["Tampa, FL"],
        categories: [],
        limit: 20,
        concurrency: 1,
        dayOfWeek: 1,
        hourOfDay: 8,
        autoImport: true,
        enabled: true,
        lastRunAt: null,
        nextRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.scheduledScrape.create.mockResolvedValue(created);

      const result = await caller.scraperSchedules.create({
        locations: ["Tampa, FL"],
        dayOfWeek: 1,
        hourOfDay: 8,
      });

      expect(prisma.scheduledScrape.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: "org-1",
            locations: ["Tampa, FL"],
            dayOfWeek: 1,
            hourOfDay: 8,
            nextRunAt: expect.any(Date),
          }),
        }),
      );
      expect(result.id).toBe("sched-new");
    });

    it("rejects when the org already has 10 schedules", async () => {
      prisma.scheduledScrape.count.mockResolvedValue(10);

      await expect(
        caller.scraperSchedules.create({ locations: ["Tampa, FL"], dayOfWeek: 1, hourOfDay: 8 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(prisma.scheduledScrape.create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    const existing = {
      id: "sched-1",
      organizationId: "org-1",
      locations: ["Tampa, FL"],
      categories: [],
      limit: 20,
      concurrency: 1,
      dayOfWeek: 1,
      hourOfDay: 8,
      autoImport: true,
      enabled: true,
      lastRunAt: null,
      nextRunAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("toggles enabled flag without touching nextRunAt", async () => {
      prisma.scheduledScrape.findFirst.mockResolvedValue(existing);
      prisma.scheduledScrape.update.mockResolvedValue({ ...existing, enabled: false });

      await caller.scraperSchedules.update({ id: "sched-1", enabled: false });

      const updateCall = prisma.scheduledScrape.update.mock.calls[0][0];
      expect(updateCall.data.enabled).toBe(false);
      expect(updateCall.data.nextRunAt).toBeUndefined();
    });

    it("recomputes nextRunAt when dayOfWeek changes", async () => {
      prisma.scheduledScrape.findFirst.mockResolvedValue(existing);
      prisma.scheduledScrape.update.mockResolvedValue({ ...existing, dayOfWeek: 3 });

      await caller.scraperSchedules.update({ id: "sched-1", dayOfWeek: 3 });

      const updateCall = prisma.scheduledScrape.update.mock.calls[0][0];
      expect(updateCall.data.nextRunAt).toBeInstanceOf(Date);
    });

    it("throws NOT_FOUND when the schedule belongs to another org", async () => {
      prisma.scheduledScrape.findFirst.mockResolvedValue(null);

      await expect(
        caller.scraperSchedules.update({ id: "sched-other", enabled: true }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(prisma.scheduledScrape.update).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("deletes an existing schedule", async () => {
      const existing = { id: "sched-1", organizationId: "org-1" };
      prisma.scheduledScrape.findFirst.mockResolvedValue(existing);
      prisma.scheduledScrape.delete.mockResolvedValue(existing);

      const result = await caller.scraperSchedules.delete({ id: "sched-1" });

      expect(prisma.scheduledScrape.delete).toHaveBeenCalledWith({ where: { id: "sched-1" } });
      expect(result).toEqual({ ok: true });
    });

    it("throws NOT_FOUND for a schedule from another org", async () => {
      prisma.scheduledScrape.findFirst.mockResolvedValue(null);

      await expect(caller.scraperSchedules.delete({ id: "sched-other" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(prisma.scheduledScrape.delete).not.toHaveBeenCalled();
    });
  });
});
