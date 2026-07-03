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
import { requireVisibleLead, visibleLeadWhere } from "@/server/lead-visibility";

const TRPC_CODE_BY_OUTREACH_CODE: Record<OutreachErrorCode, "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR"> = {
  NO_EMAIL: "BAD_REQUEST",
  OPTED_OUT: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  ALREADY_SENT: "BAD_REQUEST",
  CAN_SPAM: "BAD_REQUEST",
  SEND_FAILED: "INTERNAL_SERVER_ERROR",
};

function toTRPCError(err: unknown, fallbackMessage: string): TRPCError {
  if (err instanceof TRPCError) return err;
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
      await requireVisibleLead(ctx, input.leadId, { select: { id: true } });

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

      const lead = await requireVisibleLead(ctx, input.leadId);

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
        where: {
          id: input.id,
          organizationId: ctx.organizationId,
          lead: await visibleLeadWhere(ctx),
        },
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
        const draft = await ctx.prisma.emailDraft.findFirst({
          where: {
            id: input.id,
            organizationId: ctx.organizationId,
            lead: await visibleLeadWhere(ctx),
          },
          select: { id: true },
        });
        if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found." });

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
        where: {
          id: input.id,
          organizationId: ctx.organizationId,
          lead: await visibleLeadWhere(ctx),
        },
        select: { id: true, status: true },
      });
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      if (draft.status !== EmailDraftStatus.DRAFT) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft emails can be deleted." });
      }
      return ctx.prisma.emailDraft.delete({ where: { id: input.id } });
    }),
});
