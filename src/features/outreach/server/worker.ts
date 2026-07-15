import { EmailDraftStatus, OutreachJobStatus, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { generateWebsiteForLead } from "@/features/websites/server/service";
import { generateDraftForLead, OutreachEmailError } from "@/features/emails/server/service";
import {
  generateSmsDraftForLead,
  normalizePhoneNumber,
  OutreachSmsError,
} from "@/features/sms/server/service";
import { isSmsConfigured } from "@/features/sms/server/twilio";

const MAX_ATTEMPTS = 3;
// PROCESSING rows older than this are assumed orphaned (killed worker) and
// are returned to PENDING, mirroring the scraper's reconcileOrphanedJobs.
const STALE_PROCESSING_MS = 10 * 60 * 1000;

export type ProcessQueueResult = {
  processed: number;
  done: number;
  skipped: number;
  failed: number;
  retried: number;
};

/**
 * Drains a batch of pending outreach jobs: for each enqueued lead, generates
 * the AI demo website and an SMS-first outreach draft, with email fallback.
 * Drafts are never sent here — sending is always an explicit user action from
 * the review queue.
 *
 * Safe to run from overlapping cron ticks: items are claimed with an atomic
 * conditional update, so two workers can never process the same job.
 */
export async function processOutreachQueue(opts?: {
  batchSize?: number;
  timeBudgetMs?: number;
  prisma?: PrismaClient;
}): Promise<ProcessQueueResult> {
  const prisma = opts?.prisma ?? defaultPrisma;
  const batchSize = opts?.batchSize ?? Number(process.env.OUTREACH_BATCH_SIZE ?? 5);
  const timeBudgetMs = opts?.timeBudgetMs ?? 55_000;
  const startedAt = Date.now();

  // Recover items orphaned by a killed worker.
  await prisma.outreachJob.updateMany({
    where: {
      status: OutreachJobStatus.PROCESSING,
      updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) },
    },
    data: { status: OutreachJobStatus.PENDING },
  });

  const candidates = await prisma.outreachJob.findMany({
    where: { status: OutreachJobStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: batchSize,
    select: { id: true },
  });

  const result: ProcessQueueResult = { processed: 0, done: 0, skipped: 0, failed: 0, retried: 0 };

  for (const candidate of candidates) {
    if (Date.now() - startedAt > timeBudgetMs) break;

    // Atomic claim — count 0 means another worker got there first.
    const claimed = await prisma.outreachJob.updateMany({
      where: { id: candidate.id, status: OutreachJobStatus.PENDING },
      data: { status: OutreachJobStatus.PROCESSING, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    const job = await prisma.outreachJob.findUnique({ where: { id: candidate.id } });
    if (!job) continue;
    result.processed++;

    const skip = async (reason: string) => {
      await prisma.outreachJob.update({
        where: { id: job.id },
        data: { status: OutreachJobStatus.SKIPPED, skipReason: reason, processedAt: new Date() },
      });
      result.skipped++;
    };

    try {
      const lead = await prisma.lead.findUnique({ where: { id: job.leadId } });
      if (!lead || lead.organizationId !== job.organizationId) {
        await skip("lead_deleted");
        continue;
      }
      const normalizedPhone = normalizePhoneNumber(lead.phone);
      const useSms = Boolean(normalizedPhone && isSmsConfigured());
      if (!useSms && !lead.email) {
        await skip(normalizedPhone ? "sms_not_configured" : "no_contact");
        continue;
      }

      if (useSms) {
        const optOut = await prisma.phoneOptOut.findUnique({
          where: {
            phone_organizationId: {
              phone: normalizedPhone!,
              organizationId: job.organizationId,
            },
          },
          select: { id: true },
        });
        if (optOut) {
          await skip("phone_opted_out");
          continue;
        }
        const existingDraft = await prisma.smsDraft.findFirst({
          where: {
            leadId: lead.id,
            organizationId: job.organizationId,
            status: { in: ["DRAFT", "SENT", "DELIVERED"] },
          },
          select: { id: true },
        });
        if (existingDraft) {
          await skip("draft_exists");
          continue;
        }
      } else {
        const optOut = await prisma.emailOptOut.findUnique({
          where: { email_organizationId: { email: lead.email!, organizationId: job.organizationId } },
          select: { id: true },
        });
        if (optOut) {
          await skip("opted_out");
          continue;
        }
        const existingDraft = await prisma.emailDraft.findFirst({
          where: {
            leadId: lead.id,
            organizationId: job.organizationId,
            status: { in: [EmailDraftStatus.DRAFT, EmailDraftStatus.SENT] },
          },
          select: { id: true },
        });
        if (existingDraft) {
          await skip("draft_exists");
          continue;
        }
      }

      const { website } = await generateWebsiteForLead(prisma, lead, {
        organizationId: job.organizationId,
        userId: job.createdById,
      });
      const { draftId } = useSms
        ? await generateSmsDraftForLead(prisma, lead, {
            organizationId: job.organizationId,
            userId: job.createdById,
          })
        : await generateDraftForLead(prisma, lead, {
            organizationId: job.organizationId,
            userId: job.createdById,
          });

      await prisma.outreachJob.update({
        where: { id: job.id },
        data: {
          status: OutreachJobStatus.DONE,
          websiteId: website.id,
          draftId: useSms ? null : draftId,
          smsDraftId: useSms ? draftId : null,
          error: null,
          processedAt: new Date(),
        },
      });
      result.done++;
    } catch (err) {
      // OutreachEmailError business failures (e.g. opted out between checks)
      // and transient generation failures are both retried up to MAX_ATTEMPTS.
      const message =
        err instanceof OutreachEmailError || err instanceof OutreachSmsError || err instanceof Error
          ? err.message
          : String(err);
      const exhausted = job.attempts >= MAX_ATTEMPTS;
      await prisma.outreachJob
        .update({
          where: { id: job.id },
          data: {
            status: exhausted ? OutreachJobStatus.FAILED : OutreachJobStatus.PENDING,
            error: message,
            ...(exhausted ? { processedAt: new Date() } : {}),
          },
        })
        .catch(() => {});
      if (exhausted) result.failed++;
      else result.retried++;
    }
  }

  return result;
}
