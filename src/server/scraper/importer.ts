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

export async function importRowsToLeads(opts: {
  rows: ScrapedRow[];
  organizationId: string;
  assignedToId: string;
  jobId: string;
}): Promise<{ inserted: number; skipped: number }> {
  const { rows, organizationId, assignedToId, jobId } = opts;
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const existing = await prisma.lead.findMany({
    where: { organizationId },
    select: { company: true, phone: true },
  });
  const existingKeys = new Set(
    existing.map((l) => `${(l.company ?? "").toLowerCase()}|${(l.phone ?? "").replace(/\D/g, "")}`)
  );

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
    const key = `${company.toLowerCase()}|${(phone ?? "").replace(/\D/g, "")}`;
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
