import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { parseCityState } from "@/features/leads/location";
import { parseLatLngFromMapsUrl } from "@/features/map/shared/coords";

export type ScrapedRow = {
  Name?: string;
  Phone?: string;
  Email?: string;
  Website?: string;
  "Google Maps URL"?: string;
  Rating?: string;
  Reviews?: string;
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
// Regex hits over page text often catch retina image filenames (logo@2x.png).
const EMAIL_JUNK_SUFFIXES = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];

/**
 * The scraper sanitizes CSV cells against formula injection by prefixing a
 * leading `'`; strip it back off, then validate so junk regex hits from the
 * Maps panel (image filenames etc.) never land on a Lead.
 */
function sanitizeEmail(raw: string | undefined): string | null {
  const email = (raw ?? "").trim().replace(/^'+/, "").toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return null;
  if (EMAIL_JUNK_SUFFIXES.some((suffix) => email.endsWith(suffix))) return null;
  return email;
}

function dedupKey(company: string, phone: string | null): string {
  return `${company.toLowerCase()}|${normalizePhone(phone)}`;
}

function rowFingerprint(row: ScrapedRow): string {
  const sourceUrl = (row["Google Maps URL"] ?? "").trim().toLowerCase();
  const name = (row.Name ?? "").trim().toLowerCase();
  const phone = normalizePhone(row.Phone);
  const location = (row.Location ?? "").trim().toLowerCase();
  const category = (row.Category ?? "").trim().toLowerCase();
  const stableKey = sourceUrl || [name, phone, location, category].join("|");
  return createHash("sha256").update(stableKey).digest("hex");
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
): Promise<Map<string, { id: string; rating: number | null; reviewCount: number | null }>> {
  if (companies.length === 0) return new Map();

  const seen = new Map<string, { id: string; rating: number | null; reviewCount: number | null }>();
  for (let i = 0; i < companies.length; i += DEDUP_CHUNK) {
    const slice = companies.slice(i, i + DEDUP_CHUNK);
    const rows = await prisma.lead.findMany({
      where: {
        organizationId,
        company: { in: slice, mode: "insensitive" },
      },
      select: { id: true, company: true, phone: true, rating: true, reviewCount: true },
    });
    for (const r of rows) {
      seen.set(dedupKey(r.company ?? "", r.phone ?? null), {
        id: r.id,
        rating: r.rating ?? null,
        reviewCount: r.reviewCount ?? null,
      });
    }
  }
  return seen;
}

export async function importRowsToLeads(opts: {
  rows: ScrapedRow[];
  organizationId: string;
  assignedToId: string;
  jobId: string;
}): Promise<{
  inserted: number;
  skipped: number;
  createdLeads: Array<{ id: string; email: string | null }>;
}> {
  const { rows, organizationId, assignedToId, jobId } = opts;
  if (rows.length === 0) return { inserted: 0, skipped: 0, createdLeads: [] };

  const rowFingerprints = Array.from(new Set(rows.map(rowFingerprint)));
  const alreadyImported = await prisma.scraperImportedRow.findMany({
    where: {
      jobId,
      fingerprint: { in: rowFingerprints },
    },
    select: { fingerprint: true },
  });
  const importedFingerprints = new Set(alreadyImported.map((r) => r.fingerprint));

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
    fingerprint: string;
    company: string;
    phone: string | null;
    email: string | null;
    website: string | null;
    mapsUrl: string | null;
    latitude: number | null;
    longitude: number | null;
    city: string | null;
    state: string | null;
    rating: number | null;
    reviewCount: number | null;
    source: string;
    organizationId: string;
    assignedToId: string;
  }> = [];
  const toUpdate: Array<{ id: string; data: { rating?: number | null; reviewCount?: number | null } }> = [];
  let skipped = 0;

  for (const row of rows) {
    const fingerprint = rowFingerprint(row);
    if (importedFingerprints.has(fingerprint)) {
      skipped++;
      continue;
    }
    const company = (row.Name ?? "").trim();
    if (!company) {
      skipped++;
      continue;
    }
    const phone = (row.Phone ?? "").trim() || null;
    const email = sanitizeEmail(row.Email);
    const website = (row.Website ?? "").trim() || null;
    const mapsUrl = (row["Google Maps URL"] ?? "").trim() || null;
    const coords = parseLatLngFromMapsUrl(mapsUrl);
    const ratingRaw = (row.Rating ?? "").trim();
    const reviewCountRaw = (row.Reviews ?? "").trim();
    const rating = ratingRaw ? Number(ratingRaw) : null;
    const reviewCount = reviewCountRaw ? Number(reviewCountRaw) : null;
    const location = parseCityState(row.Location);
    const key = dedupKey(company, phone);
    const existing = existingKeys.get(key);
    if (existing) {
      const data: { rating?: number | null; reviewCount?: number | null } = {};
      const nextRating = Number.isFinite(rating) ? rating : null;
      const nextReviewCount = Number.isFinite(reviewCount) ? reviewCount : null;
      if (nextRating !== null && existing.rating !== nextRating) {
        data.rating = nextRating;
      }
      if (nextReviewCount !== null && existing.reviewCount !== nextReviewCount) {
        data.reviewCount = nextReviewCount;
      }
      if (Object.keys(data).length > 0) {
        // Only enqueue a DB update for rows that map to a real persisted lead.
        // A brand-new row earlier in this same batch stores a placeholder
        // `id: ""` (see below); updating `where: { id: "" }` throws
        // RecordNotFound and rejects the whole import (#187-2). The new row's
        // values were already captured by the first occurrence's insert.
        if (existing.id) {
          toUpdate.push({ id: existing.id, data });
          existingKeys.set(key, {
            ...existing,
            rating: data.rating ?? existing.rating,
            reviewCount: data.reviewCount ?? existing.reviewCount,
          });
        }
      }
      skipped++;
      continue;
    }
    existingKeys.set(key, { id: "", rating: Number.isFinite(rating) ? rating : null, reviewCount: Number.isFinite(reviewCount) ? reviewCount : null });
    importedFingerprints.add(fingerprint);

    const sourceParts = ["GoogleMaps"];
    if (row.Category) sourceParts.push(row.Category);
    if (row.Location) sourceParts.push(row.Location);

    toInsert.push({
      fingerprint,
      company,
      phone,
      email,
      website,
      mapsUrl,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      city: location.city ?? null,
      state: location.state ?? null,
      rating: Number.isFinite(rating) ? rating : null,
      reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
      source: sourceParts.join(" / "),
      organizationId,
      assignedToId,
    });
  }

  const createdLeads = toInsert.length
    ? await prisma.lead.createManyAndReturn({
        data: toInsert.map((row) => ({
          company: row.company,
          phone: row.phone,
          email: row.email,
          website: row.website,
          mapsUrl: row.mapsUrl,
          latitude: row.latitude,
          longitude: row.longitude,
          city: row.city,
          state: row.state,
          rating: row.rating,
          reviewCount: row.reviewCount,
          source: row.source,
          organizationId: row.organizationId,
          assignedToId: row.assignedToId,
        })),
        select: { id: true, email: true },
      })
    : [];

  await Promise.all(
    toUpdate.map((update) =>
      prisma.lead.update({
        where: { id: update.id },
        data: update.data,
      }),
    ),
  );

  if (createdLeads.length > 0) {
    await prisma.scraperImportedRow.createMany({
      data: toInsert.map((row) => ({
        jobId,
        fingerprint: row.fingerprint,
        sourceUrl: row.mapsUrl,
        organizationId,
        importedById: assignedToId,
      })),
      skipDuplicates: true,
    });
    await prisma.scraperJob.update({
      where: { id: jobId },
      data: { importedCount: { increment: createdLeads.length } },
    });
  }

  return { inserted: createdLeads.length, skipped, createdLeads };
}
