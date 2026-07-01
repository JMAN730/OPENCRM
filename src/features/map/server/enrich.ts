import fs from "fs/promises";
import path from "path";
import type { PrismaClient } from "@prisma/client";
import { logActivity } from "@/server/activity";

export type EnrichTarget = {
  leadId: string;
  name: string;
  website?: string | null;
  mapsUrl?: string | null;
  phone?: string | null;
};

export async function writeEnrichInput(outDir: string, businesses: EnrichTarget[]): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });
  const finalPath = path.join(outDir, "enrich-input.json");
  const tempPath = `${finalPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify({ businesses }, null, 2), "utf-8");
  await fs.rename(tempPath, finalPath);
}

type EnrichedRow = {
  leadId?: string | null;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  rating?: number | null;
  reviews?: number | null;
};

/**
 * Applies scraper --enrich output (enriched.json) onto Lead rows. Same
 * semantics as leads.bulkCreate's update branch: set fields the enrichment
 * found, never wipe existing data with nulls. Every update re-checks the
 * lead's organization before writing.
 */
export async function applyEnrichmentResults(opts: {
  prisma: PrismaClient;
  organizationId: string;
  userId: string;
  outputDir: string;
}): Promise<{ updated: number }> {
  const raw = await fs.readFile(path.join(opts.outputDir, "enriched.json"), "utf-8");
  const rows = JSON.parse(raw) as EnrichedRow[];
  let updated = 0;

  for (const row of rows) {
    if (!row?.leadId) continue;
    const lead = await opts.prisma.lead.findFirst({
      where: { id: row.leadId, organizationId: opts.organizationId },
      select: { id: true },
    });
    if (!lead) continue;

    const data: Record<string, unknown> = {};
    if (row.phone) data.phone = row.phone;
    if (row.email) data.email = row.email;
    if (row.website) data.website = row.website;
    if (typeof row.rating === "number") data.rating = row.rating;
    if (typeof row.reviews === "number") data.reviewCount = row.reviews;
    if (Object.keys(data).length === 0) continue;

    await opts.prisma.lead.update({ where: { id: lead.id }, data });
    updated++;
    await logActivity(opts.prisma, {
      leadId: lead.id,
      userId: opts.userId,
      type: "LEAD_ENRICHED",
      description: `Contact details enriched from the lead map (${Object.keys(data).join(", ")})`,
      organizationId: opts.organizationId,
    });
  }

  return { updated };
}
