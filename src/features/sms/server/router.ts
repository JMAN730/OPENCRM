import { TRPCError } from "@trpc/server";
import { SmsDraftStatus } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { requireVisibleLead } from "@/server/lead-visibility";
import { visibleLeadWhere } from "@/server/lead-visibility";
import { assertWithinRateLimit } from "@/lib/rateLimit";
import { keys } from "@/lib/cacheKeys";
import { isSmsConfigured } from "@/features/sms/server/twilio";
import {
  generateDraftForLead,
  OutreachSmsError,
  sendDraft,
  type SmsErrorCode,
} from "@/features/sms/server/service";

const TRPC_CODE_BY_SMS_CODE: Record<
  SmsErrorCode,
  "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" | "PRECONDITION_FAILED" | "INTERNAL_SERVER_ERROR"
> = {
  NO_PHONE: "BAD_REQUEST",
  INVALID_PHONE: "BAD_REQUEST",
  OPTED_OUT: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  ALREADY_SENT: "BAD_REQUEST",
  NON_COMPLIANT: "BAD_REQUEST",
  NOT_CONFIGURED: "PRECONDITION_FAILED",
  SEND_FAILED: "INTERNAL_SERVER_ERROR",
};

function toTRPCError(error: unknown, fallbackMessage: string): TRPCError {
  if (error instanceof TRPCError) return error;
  if (error instanceof OutreachSmsError) {
    return new TRPCError({
      code: TRPC_CODE_BY_SMS_CODE[error.code],
      message: error.message,
    });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : fallbackMessage,
  });
}

export const smsRouter = createTRPCRouter({
  getDraftForLead: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireVisibleLead(ctx, input.leadId, { select: { id: true } });
      const draft = await ctx.prisma.smsDraft.findFirst({
        where: { leadId: input.leadId, organizationId: ctx.organizationId },
        orderBy: { createdAt: "desc" },
        include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
      });

      return { configured: isSmsConfigured(), draft };
    }),

  generate: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await requireVisibleLead(ctx, input.leadId);
      try {
        return await generateDraftForLead(ctx.prisma, lead, {
          organizationId: ctx.organizationId,
          userId: ctx.session.user.id,
        });
      } catch (error) {
        throw toTRPCError(error, "Failed to generate SMS draft.");
      }
    }),

  updateDraft: organizationProcedure
    .input(z.object({ id: z.string(), body: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const draft = await ctx.prisma.smsDraft.findFirst({
        where: {
          id: input.id,
          organizationId: ctx.organizationId,
          lead: await visibleLeadWhere(ctx),
        },
        select: { id: true, status: true },
      });
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      if (draft.status !== SmsDraftStatus.DRAFT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot edit a sent SMS draft.",
        });
      }

      return ctx.prisma.smsDraft.update({
        where: { id: input.id, organizationId: ctx.organizationId },
        data: { body: input.body.trim() },
      });
    }),

  send: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertWithinRateLimit({
        key: keys.smsSendBucket(ctx.organizationId),
        limit: 20,
        windowSeconds: 60,
      });

      try {
        const draft = await ctx.prisma.smsDraft.findFirst({
          where: {
            id: input.id,
            organizationId: ctx.organizationId,
            lead: await visibleLeadWhere(ctx),
          },
          select: { id: true },
        });
        if (!draft) {
          throw new TRPCError({ code: "NOT_FOUND", message: "SMS draft not found." });
        }

        return await sendDraft(ctx.prisma, {
          draftId: input.id,
          organizationId: ctx.organizationId,
          userId: ctx.session.user.id,
        });
      } catch (error) {
        throw toTRPCError(error, "Failed to send SMS.");
      }
    }),
});
