import type { PrismaClient } from "@prisma/client";

/**
 * Enqueue leads for automated outreach (demo site + email draft generation).
 * Idempotent: `OutreachJob.leadId` is unique and duplicates are skipped, so
 * re-importing the same scraper job can never double-generate.
 *
 * Leads without an email are enqueued too — the worker marks them SKIPPED
 * with a reason so the review queue can report them instead of silently
 * dropping them.
 */
export async function enqueueOutreachForLeads(
  prisma: PrismaClient,
  opts: { leadIds: string[]; organizationId: string; createdById: string },
): Promise<{ enqueued: number }> {
  if (opts.leadIds.length === 0) return { enqueued: 0 };
  const result = await prisma.outreachJob.createMany({
    data: opts.leadIds.map((leadId) => ({
      leadId,
      organizationId: opts.organizationId,
      createdById: opts.createdById,
    })),
    skipDuplicates: true,
  });
  return { enqueued: result.count };
}
