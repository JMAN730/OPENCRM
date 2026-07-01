import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { EmailDraftStatus, OutreachJobStatus } from "@prisma/client";
import { OutreachEmailError, sendDraft } from "@/features/emails/server/service";
import { assertWithinRateLimit } from "@/lib/rateLimit";

type OutreachListPage = {
  items: Array<{
    id: string;
    status: OutreachJobStatus;
    attempts: number;
    error: string | null;
    skipReason: string | null;
    processedAt: Date | null;
    createdAt: Date;
    lead: {
      id: string;
      company: string | null;
      email: string | null;
      city: string | null;
      state: string | null;
    };
    draft: { id: string; subject: string; status: EmailDraftStatus; sentAt: Date | null } | null;
    website: { id: string; slug: string | null } | null;
  }>;
  nextCursor: string | undefined;
};

export const outreachRouter = createTRPCRouter({
  stats: organizationProcedure.query(async ({ ctx }) => {
    const groups = await ctx.prisma.outreachJob.groupBy({
      by: ["status"],
      where: { organizationId: ctx.organizationId },
      _count: { _all: true },
    });
    const counts: Record<OutreachJobStatus, number> = {
      PENDING: 0,
      PROCESSING: 0,
      DONE: 0,
      FAILED: 0,
      SKIPPED: 0,
    };
    for (const group of groups) counts[group.status] = group._count._all;
    return counts;
  }),

  list: organizationProcedure
    .input(
      z.object({
        status: z.nativeEnum(OutreachJobStatus).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }): Promise<OutreachListPage> => {
      const rows = await ctx.prisma.outreachJob.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          lead: { select: { id: true, company: true, email: true, city: true, state: true } },
        },
      });

      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;

      // websiteId/draftId are plain string columns — resolve them with org-scoped
      // IN queries instead of FK joins.
      const draftIds = page.map((r) => r.draftId).filter((id): id is string => !!id);
      const websiteIds = page.map((r) => r.websiteId).filter((id): id is string => !!id);
      const [drafts, websites] = await Promise.all([
        draftIds.length
          ? ctx.prisma.emailDraft.findMany({
              where: { id: { in: draftIds }, organizationId: ctx.organizationId },
              select: { id: true, subject: true, status: true, sentAt: true },
            })
          : [],
        websiteIds.length
          ? ctx.prisma.generatedWebsite.findMany({
              where: { id: { in: websiteIds }, organizationId: ctx.organizationId },
              select: { id: true, slug: true },
            })
          : [],
      ]);
      const draftById = new Map(drafts.map((d) => [d.id, d]));
      const websiteById = new Map(websites.map((w) => [w.id, w]));

      return {
        items: page.map((row) => ({
          id: row.id,
          status: row.status,
          attempts: row.attempts,
          error: row.error,
          skipReason: row.skipReason,
          processedAt: row.processedAt,
          createdAt: row.createdAt,
          lead: row.lead,
          draft: (row.draftId && draftById.get(row.draftId)) || null,
          website: (row.websiteId && websiteById.get(row.websiteId)) || null,
        })),
        nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
      };
    }),

  retry: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.outreachJob.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        select: { id: true, status: true },
      });
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.status !== OutreachJobStatus.FAILED && job.status !== OutreachJobStatus.SKIPPED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only failed or skipped items can be retried.",
        });
      }
      await ctx.prisma.outreachJob.update({
        where: { id: job.id },
        data: { status: OutreachJobStatus.PENDING, attempts: 0, error: null, skipReason: null },
      });
      return { ok: true };
    }),

  bulkSend: organizationProcedure
    .input(z.object({ draftIds: z.array(z.string()).min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      // Shares the single-send limiter key so bulk and per-lead sends draw
      // from the same 20/minute budget. Each draft in the batch consumes one
      // unit — otherwise a 20-draft bulk send would cost the same as a single
      // send and the budget would be 400 emails/minute instead of 20.
      await assertWithinRateLimit({
        key: `email-send:${ctx.organizationId}`,
        limit: 20,
        windowSeconds: 60,
        cost: input.draftIds.length,
      });

      const sent: string[] = [];
      const failed: Array<{ draftId: string; error: string }> = [];
      for (const draftId of input.draftIds) {
        try {
          await sendDraft(ctx.prisma, {
            draftId,
            organizationId: ctx.organizationId,
            userId: ctx.session.user.id,
          });
          sent.push(draftId);
        } catch (err) {
          failed.push({
            draftId,
            error:
              err instanceof OutreachEmailError || err instanceof Error
                ? err.message
                : "Failed to send email.",
          });
        }
      }
      return { sent, failed };
    }),
});
