import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { EmailDraftStatus, OutreachJobStatus, SmsDraftStatus } from "@prisma/client";
import { OutreachEmailError, sendDraft } from "@/features/emails/server/service";
import { OutreachSmsError, sendSmsDraft } from "@/features/sms/server/service";
import { assertWithinRateLimit } from "@/lib/rateLimit";
import { keys } from "@/lib/cacheKeys";
import { visibleLeadWhere } from "@/server/lead-visibility";

type OutreachChannel = "EMAIL" | "SMS";

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
      phone: string | null;
      city: string | null;
      state: string | null;
    };
    draft:
      | {
          id: string;
          channel: "EMAIL";
          subject: string;
          body: string;
          status: EmailDraftStatus;
          sentAt: Date | null;
        }
      | {
          id: string;
          channel: "SMS";
          body: string;
          status: SmsDraftStatus;
          sentAt: Date | null;
        }
      | null;
    website: { id: string; slug: string | null } | null;
  }>;
  nextCursor: string | undefined;
};

export const outreachRouter = createTRPCRouter({
  stats: organizationProcedure.query(async ({ ctx }) => {
    const leadWhere = await visibleLeadWhere(ctx);
    const groups = await ctx.prisma.outreachJob.groupBy({
      by: ["status"],
      where: { organizationId: ctx.organizationId, lead: leadWhere },
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
      const leadWhere = await visibleLeadWhere(ctx);
      const rows = await ctx.prisma.outreachJob.findMany({
        where: {
          organizationId: ctx.organizationId,
          lead: leadWhere,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          lead: {
            select: { id: true, company: true, email: true, phone: true, city: true, state: true },
          },
        },
      });

      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;

      // websiteId/draftId are plain string columns — resolve them with org-scoped
      // IN queries instead of FK joins.
      const draftIds = page.map((r) => r.draftId).filter((id): id is string => !!id);
      const smsDraftIds = page.map((r) => r.smsDraftId).filter((id): id is string => !!id);
      const websiteIds = page.map((r) => r.websiteId).filter((id): id is string => !!id);
      const [drafts, smsDrafts, websites] = await Promise.all([
        draftIds.length
          ? ctx.prisma.emailDraft.findMany({
              where: { id: { in: draftIds }, organizationId: ctx.organizationId },
              select: { id: true, subject: true, body: true, status: true, sentAt: true },
            })
          : [],
        smsDraftIds.length
          ? ctx.prisma.smsDraft.findMany({
              where: { id: { in: smsDraftIds }, organizationId: ctx.organizationId },
              select: { id: true, body: true, status: true, sentAt: true },
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
      const smsDraftById = new Map(smsDrafts.map((d) => [d.id, d]));
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
          draft: row.smsDraftId
            ? (() => {
                const draft = smsDraftById.get(row.smsDraftId);
                return draft ? { ...draft, channel: "SMS" as const } : null;
              })()
            : row.draftId
              ? (() => {
                  const draft = draftById.get(row.draftId);
                  return draft ? { ...draft, channel: "EMAIL" as const } : null;
                })()
              : null,
          website: (row.websiteId && websiteById.get(row.websiteId)) || null,
        })),
        nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
      };
    }),

  retry: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const leadWhere = await visibleLeadWhere(ctx);
      const job = await ctx.prisma.outreachJob.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId, lead: leadWhere },
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
    .input(
      z.object({
        drafts: z
          .array(z.object({ id: z.string(), channel: z.enum(["EMAIL", "SMS"]) }))
          .min(1)
          .max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Shares the single-send limiter key so bulk and per-lead sends draw
      // from the same 20/minute budget. Each draft in the batch consumes one
      // unit — otherwise a 20-draft bulk send would cost the same as a single
      // send and the budget would be 400 emails/minute instead of 20.
      const emailCount = input.drafts.filter((draft) => draft.channel === "EMAIL").length;
      const smsCount = input.drafts.length - emailCount;
      if (emailCount > 0) {
        await assertWithinRateLimit({
          key: keys.emailSendBucket(ctx.organizationId),
          limit: 20,
          windowSeconds: 60,
          cost: emailCount,
        });
      }
      if (smsCount > 0) {
        await assertWithinRateLimit({
          key: keys.smsSendBucket(ctx.organizationId),
          limit: 20,
          windowSeconds: 60,
          cost: smsCount,
        });
      }

      const leadWhere = await visibleLeadWhere(ctx);
      const sent: Array<{ id: string; channel: OutreachChannel }> = [];
      const failed: Array<{ id: string; channel: OutreachChannel; error: string }> = [];
      for (const draft of input.drafts) {
        try {
          const visible =
            draft.channel === "SMS"
              ? await ctx.prisma.smsDraft.findFirst({
                  where: { id: draft.id, organizationId: ctx.organizationId, lead: leadWhere },
                  select: { id: true },
                })
              : await ctx.prisma.emailDraft.findFirst({
                  where: { id: draft.id, organizationId: ctx.organizationId, lead: leadWhere },
                  select: { id: true },
                });
          if (!visible) throw new Error("Draft not found.");
          if (draft.channel === "SMS") {
            await sendSmsDraft(ctx.prisma, {
              draftId: draft.id,
              organizationId: ctx.organizationId,
              userId: ctx.session.user.id,
            });
          } else {
            await sendDraft(ctx.prisma, {
              draftId: draft.id,
              organizationId: ctx.organizationId,
              userId: ctx.session.user.id,
            });
          }
          sent.push(draft);
        } catch (err) {
          failed.push({
            ...draft,
            error:
              err instanceof OutreachEmailError ||
              err instanceof OutreachSmsError ||
              err instanceof Error
                ? err.message
                : "Failed to send outreach.",
          });
        }
      }
      return { sent, failed };
    }),
});
