import fs from "fs/promises";
import path from "path";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";

export type ScrapedRow = {
  Name?: string;
  Phone?: string;
  Website?: string;
  Category?: string;
  Location?: string;
};

export type ImportFilter = {
  categories?: string[];
  locations?: string[];
  excludeMissingPhone?: boolean;
};

// Chunk size for the bounded existing-lookup query. Keeps the IN(...) list
// from blowing up Postgres' query planner on very large CSVs.
const DEDUP_CHUNK = 1000;

export async function readScrapedCsv(jobOutputDir: string): Promise<ScrapedRow[]> {
  const csvPath = path.join(jobOutputDir, "leads.csv");
  let raw: string;
  try {
    raw = await fs.readFile(csvPath, "utf-8");
  } catch {
    return [];
  }
  const parsed = Papa.parse<ScrapedRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  return (parsed.data ?? []).filter((r): r is ScrapedRow => !!r);
}

export function applyFilter(rows: ScrapedRow[], filter?: ImportFilter): ScrapedRow[] {
  if (!filter) return rows;
  return rows.filter((row) => {
    if (filter.excludeMissingPhone && !row.Phone?.trim()) return false;
    if (filter.categories?.length && row.Category && !filter.categories.includes(row.Category)) {
      return false;
    }
    if (filter.locations?.length && row.Location && !filter.locations.includes(row.Location)) {
      return false;
    }
    return true;
  });
}

function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

function dedupKey(company: string, phone: string | null): string {
  return `${company.toLowerCase()}|${normalizePhone(phone)}`;
}

/**
 * Build the set of existing (company, phone) keys that overlap with the
 * incoming batch. The previous implementation loaded **every** lead in the
 * organization into memory; this version issues one indexed query bounded
 * by the size of the incoming batch.
 *
 * Index used: @@index([organizationId, company, phone])
 */
async function loadExistingKeys(
  organizationId: string,
  companies: string[],
): Promise<Set<string>> {
  if (companies.length === 0) return new Set();

  const seen = new Set<string>();
  for (let i = 0; i < companies.length; i += DEDUP_CHUNK) {
    const slice = companies.slice(i, i + DEDUP_CHUNK);
    const rows = await prisma.lead.findMany({
      where: {
        organizationId,
        company: { in: slice, mode: "insensitive" },
      },
      select: { company: true, phone: true },
    });
    for (const r of rows) {
      seen.add(dedupKey(r.company ?? "", r.phone ?? null));
    }
  }
  return seen;
}

export async function importRowsToLeads(opts: {
  rows: ScrapedRow[];
  organizationId: string;
  assignedToId: string;
  jobId: string;
}): Promise<{ inserted: number; skipped: number }> {
  const { rows, organizationId, assignedToId, jobId } = opts;
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  // Distinct companies in the incoming batch — keeps the lookup bounded by
  // the request size rather than the org's total lead count.
  const companiesSet = new Set<string>();
  for (const row of rows) {
    const c = (row.Name ?? "").trim();
    if (c) companiesSet.add(c);
  }
  const companies = Array.from(companiesSet);

  const existingKeys = await loadExistingKeys(organizationId, companies);

  const toInsert: Array<{
    company: string;
    phone: string | null;
    website: string | null;
    source: string;
    organizationId: string;
    assignedToId: string;
  }> = [];
  let skipped = 0;

  for (const row of rows) {
    const company = (row.Name ?? "").trim();
    if (!company) {
      skipped++;
      continue;
    }
    const phone = (row.Phone ?? "").trim() || null;
    const website = (row.Website ?? "").trim() || null;
    const key = dedupKey(company, phone);
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    existingKeys.add(key);

    const sourceParts = ["GoogleMaps"];
    if (row.Category) sourceParts.push(row.Category);
    if (row.Location) sourceParts.push(row.Location);

    toInsert.push({
      company,
      phone,
      website,
      source: sourceParts.join(" / "),
      organizationId,
      assignedToId,
    });
  }

  if (toInsert.length === 0) return { inserted: 0, skipped };

  const result = await prisma.lead.createMany({
    data: toInsert,
  });

  await prisma.scraperJob.update({
    where: { id: jobId },
    data: { importedCount: { increment: result.count } },
  });

  return { inserted: result.count, skipped };
}
