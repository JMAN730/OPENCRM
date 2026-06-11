import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { EmailDraftStatus } from "@prisma/client";
import {
  OutreachEmailError,
  type OutreachErrorCode,
  generateDraftForLead,
  sendDraft,
} from "@/features/emails/server/service";
import { assertWithinRateLimit } from "@/lib/rateLimit";

type EmailDraftListPage = {
  items: Array<{
    id: string;
    subject: string;
    status: EmailDraftStatus;
    sentAt: Date | null;
    lead: {
      id: string;
      company: string | null;
      email: string | null;
      city: string | null;
      state: string | null;
    };
    events: Array<{ event: string }>;
  }>;
  nextCursor: string | undefined;
};

const TRPC_CODE_BY_OUTREACH_CODE: Record<OutreachErrorCode, "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR"> = {
  NO_EMAIL: "BAD_REQUEST",
  OPTED_OUT: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  ALREADY_SENT: "BAD_REQUEST",
  CAN_SPAM: "BAD_REQUEST",
  SEND_FAILED: "INTERNAL_SERVER_ERROR",
};

function toTRPCError(err: unknown, fallbackMessage: string): TRPCError {
  if (err instanceof OutreachEmailError) {
    return new TRPCError({ code: TRPC_CODE_BY_OUTREACH_CODE[err.code], message: err.message });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: err instanceof Error ? err.message : fallbackMessage,
  });
}

export const emailsRouter = createTRPCRouter({
  getDraftForLead: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.emailDraft.findFirst({
        where: { leadId: input.leadId, organizationId: ctx.organizationId },
        orderBy: { createdAt: "desc" },
        include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
      });
    }),

  generate: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertWithinRateLimit({
        key: `email-gen:${ctx.organizationId}:${input.leadId}`,
        limit: 3,
        windowSeconds: 30,
      });

      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, organizationId: ctx.organizationId },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });

      try {
        return await generateDraftForLead(ctx.prisma, lead, {
          organizationId: ctx.organizationId,
          userId: ctx.session.user.id,
        });
      } catch (err) {
        throw toTRPCError(err, "Failed to generate email copy.");
      }
    }),

  updateDraft: organizationProcedure
    .input(z.object({
      id: z.string(),
      subject: z.string().min(1).max(255),
      body: z.string().min(1).max(50000),
    }))
    .mutation(async ({ ctx, input }) => {
      const draft = await ctx.prisma.emailDraft.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        select: { id: true, status: true },
      });
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      if (draft.status !== EmailDraftStatus.DRAFT) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a sent email." });
      }

      return ctx.prisma.emailDraft.update({
        where: { id: input.id },
        data: { subject: input.subject.trim(), body: input.body.trim() },
      });
    }),

  send: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertWithinRateLimit({
        key: `email-send:${ctx.organizationId}`,
        limit: 20,
        windowSeconds: 60,
      });

      try {
        return await sendDraft(ctx.prisma, {
          draftId: input.id,
          organizationId: ctx.organizationId,
          userId: ctx.session.user.id,
        });
      } catch (err) {
        throw toTRPCError(err, "Failed to send email.");
      }
    }),

  deleteDraft: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const draft = await ctx.prisma.emailDraft.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        select: { id: true, status: true },
      });
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      if (draft.status !== EmailDraftStatus.DRAFT) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft emails can be deleted." });
      }
      return ctx.prisma.emailDraft.delete({ where: { id: input.id } });
    }),

  listForOrg: organizationProcedure
    .input(z.object({
      status: z.nativeEnum(EmailDraftStatus).optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }): Promise<EmailDraftListPage> => {
      const items = await ctx.prisma.emailDraft.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          lead: { select: { id: true, company: true, email: true, city: true, state: true } },
          events: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      });

      const hasMore = items.length > input.limit;
      const page = hasMore ? items.slice(0, input.limit) : items;
      return {
        items: page.map((item) => ({
          id: item.id,
          subject: item.subject,
          status: item.status,
          sentAt: item.sentAt,
          lead: item.lead,
          events: item.events.map((event) => ({ event: event.event })),
        })),
        nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
      };
    }),
});
