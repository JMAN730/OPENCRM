import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "path";
import os from "os";
import fs from "fs/promises";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    lead: {
      findMany: vi.fn(),
      update: vi.fn(),
      createManyAndReturn: vi.fn(),
    },
    scraperJob: {
      update: vi.fn(),
    },
    scraperImportedRow: {
      findMany: vi.fn(),
      createMany: vi.fn(),
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
    mockPrisma.lead.update.mockResolvedValue({});
    // Echo the inserted rows back the way Postgres would.
    mockPrisma.lead.createManyAndReturn.mockImplementation(
      async ({ data }: { data: Array<{ email?: string | null }> }) =>
        data.map((d, i) => ({ id: `lead-${i + 1}`, email: d.email ?? null })),
    );
    mockPrisma.scraperJob.update.mockResolvedValue({});
    mockPrisma.scraperImportedRow.findMany.mockResolvedValue([]);
    mockPrisma.scraperImportedRow.createMany.mockResolvedValue({ count: 0 });
  });

  it("returns zero counts and no DB writes when given no rows", async () => {
    const result = await importRowsToLeads({
      rows: [],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    expect(result).toEqual({ inserted: 0, skipped: 0, createdLeads: [] });
    expect(mockPrisma.lead.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.lead.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("skips rows with no Name", async () => {

    const result = await importRowsToLeads({
      rows: [{ Name: "" }, { Name: "  " }, { Phone: "555" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    expect(result.skipped).toBe(3);
    expect(mockPrisma.lead.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("dedupes against existing leads in the org by company+phone (digits only)", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([
      { company: "Acme", phone: "555-1234" },
    ]);

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

    expect(result).toMatchObject({ inserted: 1, skipped: 2 });
    const inserted = mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data;
    expect(inserted).toHaveLength(1);
    expect(inserted[0].company).toBe("Beta");
  });

  it("dedupes within the incoming batch as well", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);

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
    expect(mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data).toHaveLength(1);
  });

  it("does not enqueue a placeholder-id update when the same business appears under two categories (#187-2)", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]); // brand new business

    const result = await importRowsToLeads({
      rows: [
        // First occurrence — inserted, stored with a placeholder id ("").
        { Name: "Acme", Phone: "555", Category: "Cleaning", Rating: "4.0" },
        // Same dedupKey (company + phone) but a different category → different
        // fingerprint (passes the fingerprint dedup) and a differing rating, so
        // the importer takes the "existing" branch. The matched key is still the
        // in-batch placeholder, so no DB update must be enqueued (id === "").
        { Name: "Acme", Phone: "555", Category: "Plumbing", Rating: "4.8" },
      ],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    expect(result).toMatchObject({ inserted: 1, skipped: 1 });
    // Crucially: never call update with the placeholder id (would throw
    // RecordNotFound against a real DB and reject the whole import).
    expect(mockPrisma.lead.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "" } }),
    );
    expect(mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data).toHaveLength(1);
  });

  it("builds source string from category and location when present", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);

    await importRowsToLeads({
      rows: [{ Name: "Acme", Phone: "555", Category: "Cleaning", Location: "Toledo" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data[0];
    expect(inserted.source).toBe("GoogleMaps / Cleaning / Toledo");
  });

  it("parses city and state from scraped locations", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);

    await importRowsToLeads({
      rows: [{ Name: "Acme", Phone: "555", Location: "Tampa, Florida" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data[0];
    expect(inserted.city).toBe("Tampa");
    expect(inserted.state).toBe("FL");
  });

  it("fills latitude/longitude from the Google Maps URL column", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);

    await importRowsToLeads({
      rows: [
        {
          Name: "Acme",
          Phone: "555",
          "Google Maps URL": "https://www.google.com/maps/place/Acme/data=!3d41.6528!4d-83.5379",
        },
        { Name: "Beta", Phone: "777", "Google Maps URL": "https://www.google.com/maps/search/beta" },
      ],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data;
    expect(inserted[0].latitude).toBe(41.6528);
    expect(inserted[0].longitude).toBe(-83.5379);
    expect(inserted[1].latitude).toBeNull();
    expect(inserted[1].longitude).toBeNull();
  });

  it("falls back to just 'GoogleMaps' when category and location are missing", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);

    await importRowsToLeads({
      rows: [{ Name: "Acme" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data[0];
    expect(inserted.source).toBe("GoogleMaps");
  });

  it("increments importedCount on the parent job by the number of inserted rows", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);

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
    expect(mockPrisma.scraperImportedRow.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ jobId: "job-42", organizationId: "org-1", importedById: "user-1" }),
      ]),
      skipDuplicates: true,
    });
  });

  it("skips rows already imported for the same scraper job", async () => {
    mockPrisma.scraperImportedRow.findMany.mockResolvedValue([
      {
        fingerprint: "5c3a9399a81a5b3e72fb97500ade84a15711e914e3b009ccb67dd05d6a7d21fe",
      },
    ]);

    const result = await importRowsToLeads({
      rows: [{ Name: "Acme", Phone: "555", "Google Maps URL": "https://maps.example/acme" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    expect(result).toMatchObject({ inserted: 0, skipped: 1 });
    expect(mockPrisma.lead.createManyAndReturn).not.toHaveBeenCalled();
    expect(mockPrisma.scraperJob.update).not.toHaveBeenCalled();
  });

  it("re-imports a row that was previously imported under a different job", async () => {
    // fingerprint lookup is scoped to the current jobId — no match for job-2
    mockPrisma.scraperImportedRow.findMany.mockResolvedValue([]);

    const result = await importRowsToLeads({
      rows: [{ Name: "Acme", Phone: "555", "Google Maps URL": "https://maps.example/acme" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-2",
    });

    expect(result.inserted).toBe(1);
    // Verify the fingerprint lookup was scoped to job-2, not job-1
    expect(mockPrisma.scraperImportedRow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ jobId: "job-2" }) })
    );
  });

  it("never queries leads from another organization", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);

    await importRowsToLeads({
      rows: [{ Name: "Acme" }],
      organizationId: "org-X",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    expect(mockPrisma.lead.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-X",
        company: { in: ["Acme"], mode: "insensitive" },
      },
      select: { id: true, company: true, phone: true, rating: true, reviewCount: true },
    });
  });

  it("scopes the existing-key lookup to the incoming batch (no full-table scan)", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);

    await importRowsToLeads({
      rows: [{ Name: "Acme" }, { Name: "Beta" }, { Name: "Acme" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    // Only the distinct companies from the batch should be queried.
    const call = mockPrisma.lead.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe("org-1");
    expect(new Set(call.where.company.in)).toEqual(new Set(["Acme", "Beta"]));
    expect(call.where.company.mode).toBe("insensitive");
  });

  it("imports Google Maps URL when present in scraped rows", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);

    await importRowsToLeads({
      rows: [{ Name: "Acme", Phone: "555", "Google Maps URL": "https://www.google.com/maps/place/acme" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data[0];
    expect(inserted.mapsUrl).toBe("https://www.google.com/maps/place/acme");
  });

  it("sets mapsUrl to null when Google Maps URL is absent", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);

    await importRowsToLeads({
      rows: [{ Name: "Acme", Phone: "555" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data[0];
    expect(inserted.mapsUrl).toBeNull();
  });

  it("imports rating and review count when present in scraped rows", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([]);

    await importRowsToLeads({
      rows: [{ Name: "Acme", Rating: "4.6", Reviews: "128" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data[0];
    expect(inserted.rating).toBe(4.6);
    expect(inserted.reviewCount).toBe(128);
  });

  it("imports the scraped Email column, normalized to lowercase", async () => {
    const result = await importRowsToLeads({
      rows: [{ Name: "Acme", Phone: "555", Email: "Info@Acme.COM" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data[0];
    expect(inserted.email).toBe("info@acme.com");
    expect(result.createdLeads).toEqual([{ id: "lead-1", email: "info@acme.com" }]);
  });

  it("strips the CSV formula-sanitization apostrophe from emails", async () => {
    await importRowsToLeads({
      rows: [{ Name: "Acme", Email: "'info@acme.com" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data[0];
    expect(inserted.email).toBe("info@acme.com");
  });

  it("nulls out invalid or junk email values", async () => {
    await importRowsToLeads({
      rows: [
        { Name: "A", Email: "not-an-email" },
        { Name: "B", Email: "logo@2x.png" },
        { Name: "C", Email: "" },
        { Name: "D" },
      ],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    const inserted = mockPrisma.lead.createManyAndReturn.mock.calls[0][0].data;
    expect(inserted.map((r: { email: string | null }) => r.email)).toEqual([null, null, null, null]);
  });

  it("updates existing matching leads with fresher review data", async () => {
    mockPrisma.lead.findMany.mockResolvedValue([
      { id: "lead-1", company: "Acme", phone: "555", rating: 4.1, reviewCount: 10 },
    ]);

    const result = await importRowsToLeads({
      rows: [{ Name: "Acme", Phone: "555", Rating: "4.7", Reviews: "18" }],
      organizationId: "org-1",
      assignedToId: "user-1",
      jobId: "job-1",
    });

    expect(result).toMatchObject({ inserted: 0, skipped: 1 });
    expect(mockPrisma.lead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { rating: 4.7, reviewCount: 18 },
    });
  });
});
