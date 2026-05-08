import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "path";
import os from "os";
import fs from "fs/promises";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    lead: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    scraperJob: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { applyFilter, importRowsToLeads, readScrapedCsv, type ScrapedRow } from "./importer";

describe("applyFilter", () => {
  const rows: ScrapedRow[] = [
    { Name: "A", Phone: "1", Category: "Cleaning", Location: "Toledo, OH" },
    { Name: "B", Phone: "", Category: "Concrete", Location: "Akron, OH" },
    { Name: "C", Phone: "3", Category: "Cleaning", Location: "Akron, OH" },
  ];

  it("returns all rows when no filter is given", () => {
    expect(applyFilter(rows)).toEqual(rows);
    expect(applyFilter(rows, undefined)).toEqual(rows);
  });

  it("excludes rows missing a phone when excludeMissingPhone is true", () => {
    const result = applyFilter(rows, { excludeMissingPhone: true });
    expect(result.map((r) => r.Name)).toEqual(["A", "C"]);
  });

  it("filters by category whitelist", () => {
    const result = applyFilter(rows, { categories: ["Cleaning"] });
    expect(result.map((r) => r.Name)).toEqual(["A", "C"]);
  });

  it("filters by location whitelist", () => {
    const result = applyFilter(rows, { locations: ["Akron, OH"] });
    expect(result.map((r) => r.Name)).toEqual(["B", "C"]);
  });

  it("combines multiple filter criteria (AND logic)", () => {
    const result = applyFilter(rows, {
      excludeMissingPhone: true,
      categories: ["Cleaning"],
    });
    expect(result.map((r) => r.Name)).toEqual(["A", "C"]);
  });

  it("treats an empty filter array as a no-op for that criterion", () => {
    const result = applyFilter(rows, { categories: [] });
    expect(result).toEqual(rows);
  });
});

describe("readScrapedCsv", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "scraper-test-"));
  });

  it("returns an empty array when the CSV does not exist", async () => {
    const result = await readScrapedCsv(tmpDir);
    expect(result).toEqual([]);
  });

  it("parses a CSV with a header row", async () => {
    await fs.writeFile(
      path.join(tmpDir, "leads.csv"),
      "Name,Phone,Category,Location\nAcme,555-1234,Cleaning,Toledo\nBeta,,Concrete,Akron\n",
      "utf-8"
    );

    const result = await readScrapedCsv(tmpDir);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ Name: "Acme", Phone: "555-1234" });
    expect(result[1]).toMatchObject({ Name: "Beta" });
  });

  it("skips empty lines", async () => {
    await fs.writeFile(
      path.join(tmpDir, "leads.csv"),
      "Name,Phone\nAcme,555\n\n\nBeta,777\n",
      "utf-8"
    );

    const result = await readScrapedCsv(tmpDir);
    expect(result).toHaveLength(2);
  });
});

describe("importRowsToLeads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockPrisma.lead.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.scraperJob.update.mockResolvedValue({});
  });

  it("returns zero counts and no DB writes when given no rows", async () => {
    const result = await importRowsToLeads({
      rows: [],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    expect(result).toEqual({ inserted: 0, skipped: 0 });
    expect(mockPrisma.lead.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.lead.createMany).not.toHaveBeenCalled();
  });

  it("skips rows with no Name", async () => {
    mockPrisma.lead.createMany.mockResolvedValue({ count: 0 });

    const result = await importRowsToLeads({
      rows: [{ Name: "" }, { Name: "  " }, { Phone: "555" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    expect(result.skipped).toBe(3);
    expect(mockPrisma.lead.createMany).not.toHaveBeenCalled();
  });

  it("dedupes against existing leads in the org by company+phone (digits only)", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([
      { company: "Acme", phone: "555-1234" },
    ]);
    mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

    const result = await importRowsToLeads({
      rows: [
        { Name: "Acme", Phone: "(555) 1234" }, // dupe — different formatting, same digits
        { Name: "acme", Phone: "5551234" }, // dupe — different case
        { Name: "Beta", Phone: "777" },
      ],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    expect(result).toEqual({ inserted: 1, skipped: 2 });
    const inserted = mockPrisma.lead.createMany.mock.calls[0][0].data;
    expect(inserted).toHaveLength(1);
    expect(inserted[0].company).toBe("Beta");
  });

  it("dedupes within the incoming batch as well", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

    const result = await importRowsToLeads({
      rows: [
        { Name: "Acme", Phone: "555" },
        { Name: "Acme", Phone: "555" }, // dupe within batch
      ],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    expect(result.skipped).toBe(1);
    expect(mockPrisma.lead.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it("builds source string from category and location when present", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

    await importRowsToLeads({
      rows: [{ Name: "Acme", Phone: "555", Category: "Cleaning", Location: "Toledo" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createMany.mock.calls[0][0].data[0];
    expect(inserted.source).toBe("GoogleMaps / Cleaning / Toledo");
  });

  it("falls back to just 'GoogleMaps' when category and location are missing", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockPrisma.lead.createMany.mockResolvedValue({ count: 1 });

    await importRowsToLeads({
      rows: [{ Name: "Acme" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createMany.mock.calls[0][0].data[0];
    expect(inserted.source).toBe("GoogleMaps");
  });

  it("increments importedCount on the parent job by the number of inserted rows", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockPrisma.lead.createMany.mockResolvedValue({ count: 3 });

    await importRowsToLeads({
      rows: [
        { Name: "A" },
        { Name: "B" },
        { Name: "C" },
      ],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-42",
    });

    expect(mockPrisma.scraperJob.update).toHaveBeenCalledWith({
      where: { id: "job-42" },
      data: { importedCount: { increment: 3 } },
    });
  });

  it("never queries leads from another organization", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);
    mockPrisma.lead.createMany.mockResolvedValue({ count: 0 });

    await importRowsToLeads({
      rows: [{ Name: "Acme" }],
      organizationId: "org-X",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    expect(mockPrisma.lead.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-X" },
      select: { company: true, phone: true },
    });
  });
});
