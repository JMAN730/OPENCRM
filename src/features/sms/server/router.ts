import { SmsDraftStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { keys } from "@/lib/cacheKeys";
import { assertWithinRateLimit } from "@/lib/rateLimit";
import { requireVisibleLead, visibleLeadWhere } from "@/server/lead-visibility";
import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import {
  generateSmsDraftForLead,
  OutreachSmsError,
  type SmsErrorCode,
  sendSmsDraft,
} from "./service";
import { isSmsConfigured } from "./twilio";

const TRPC_CODE_BY_SMS_CODE: Record<
  SmsErrorCode,
  "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" | "PRECONDITION_FAILED" | "INTERNAL_SERVER_ERROR"
> = {
  NO_PHONE: "BAD_REQUEST",
  INVALID_PHONE: "BAD_REQUEST",
  OPTED_OUT: "CONFLICT",
  NO_WEBSITE: "PRECONDITION_FAILED",
  NOT_CONFIGURED: "PRECONDITION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  ALREADY_SENT: "BAD_REQUEST",
  SEND_FAILED: "INTERNAL_SERVER_ERROR",
};

function toTRPCError(error: unknown, fallback: string): TRPCError {
  if (error instanceof TRPCError) return error;
  if (error instanceof OutreachSmsError) {
    return new TRPCError({ code: TRPC_CODE_BY_SMS_CODE[error.code], message: error.message });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : fallback,
  });
}

export const smsRouter = createTRPCRouter({
  configuration: organizationProcedure.query(() => ({ configured: isSmsConfigured() })),

  getForLead: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireVisibleLead(ctx, input.leadId, { select: { id: true } });
      return ctx.prisma.smsDraft.findFirst({
        where: { leadId: input.leadId, organizationId: ctx.organizationId },
        orderBy: { createdAt: "desc" },
        include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
      });
    }),

  generate: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertWithinRateLimit({
        key: keys.smsGenBucket(ctx.organizationId, input.leadId),
        limit: 3,
        windowSeconds: 30,
      });
      const lead = await requireVisibleLead(ctx, input.leadId);
      try {
        return await generateSmsDraftForLead(ctx.prisma, lead, {
          organizationId: ctx.organizationId,
          userId: ctx.session.user.id,
        });
      } catch (error) {
        throw toTRPCError(error, "Failed to generate SMS draft.");
      }
    }),

  updateBody: organizationProcedure
    .input(z.object({ id: z.string(), body: z.string().trim().min(1).max(1600) }))
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
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot edit a sent SMS." });
      }
      return ctx.prisma.smsDraft.update({
        where: { id: input.id },
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
        if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "SMS draft not found." });
        return await sendSmsDraft(ctx.prisma, {
          draftId: input.id,
          organizationId: ctx.organizationId,
          userId: ctx.session.user.id,
        });
      } catch (error) {
        throw toTRPCError(error, "Failed to send SMS.");
      }
    }),
});
