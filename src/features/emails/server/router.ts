import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import { nanoid } from "nanoid";
import { EmailDraftStatus } from "@prisma/client";
import { generateEmailCopy } from "@/lib/ai";
import { trackedDemoUrl, unsubscribeUrl, validateCanSpam } from "@/lib/can-spam";
import { logActivity, ActivityType } from "@/server/activity";
import { assertWithinRateLimit } from "@/lib/rateLimit";

function resendClient() {
  return new Resend(process.env.RESEND_API_KEY);
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
      if (!lead.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lead has no email address." });
      }

      const optOut = await ctx.prisma.emailOptOut.findUnique({
        where: { email_organizationId: { email: lead.email, organizationId: ctx.organizationId } },
        select: { id: true },
      });
      if (optOut) {
        throw new TRPCError({ code: "CONFLICT", message: "This email address has opted out." });
      }

      const website = await ctx.prisma.generatedWebsite.findFirst({
        where: { leadId: input.leadId, slug: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { id: true, slug: true },
      });

      const existing = await ctx.prisma.emailDraft.findFirst({
        where: { leadId: input.leadId, organizationId: ctx.organizationId, status: EmailDraftStatus.DRAFT },
        orderBy: { createdAt: "desc" },
        select: { id: true, unsubscribeToken: true },
      });

      let copy: { subject: string; observation: string };
      try {
        copy = await generateEmailCopy(lead);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Failed to generate email copy.",
        });
      }

      const unsubToken = existing?.unsubscribeToken ?? nanoid(32);
      const unsub = unsubscribeUrl(unsubToken);
      const ownerName = lead.firstName ? `${lead.firstName}` : "there";
      const niche = lead.source ?? "local business";
      const city = lead.city ?? "your area";
      const physicalAddress = process.env.SENDER_PHYSICAL_ADDRESS ?? "";
      const senderName = process.env.SENDER_NAME ?? "OpenCRM";

      const demoLine = website?.slug
        ? `Here's the demo:\n${trackedDemoUrl(unsubToken)}\n\nNo pressure — I just wanted to show you what I had in mind before reaching out.\n\nWould you be open to me making a few changes and showing you how it could help bring in more jobs?`
        : "No pressure — I just wanted to show you what I had in mind before reaching out.\n\nWould you be open to me making a few changes and showing you how it could help bring in more jobs?";

      const body = `Hey ${ownerName},

I came across ${lead.company ?? "your business"} while looking at ${niche} businesses in ${city}.

I noticed ${copy.observation}, so I put together a quick demo website showing how you could look online and potentially turn more Google visitors into calls.

${demoLine}

${senderName}

${physicalAddress}
Unsubscribe: ${unsub}`;

      if (existing) {
        const updated = await ctx.prisma.emailDraft.update({
          where: { id: existing.id },
          data: {
            subject: copy.subject,
            body,
            websiteId: website?.id ?? null,
          },
        });
        return { draftId: updated.id };
      }

      const created = await ctx.prisma.emailDraft.create({
        data: {
          leadId: input.leadId,
          organizationId: ctx.organizationId,
          websiteId: website?.id ?? null,
          subject: copy.subject,
          body,
          unsubscribeToken: unsubToken,
        },
      });

      void logActivity(ctx.prisma, {
        leadId: input.leadId,
        userId: ctx.session.user.id,
        type: ActivityType.EMAIL_DRAFT_CREATED,
        description: `Email draft generated`,
        organizationId: ctx.organizationId,
      });

      return { draftId: created.id };
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

      const draft = await ctx.prisma.emailDraft.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: { lead: { select: { id: true, email: true, company: true, firstName: true } } },
      });
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      if (draft.status !== EmailDraftStatus.DRAFT) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Email already sent." });
      }

      const toEmail = draft.lead.email;
      if (!toEmail) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lead has no email address." });
      }

      const optOut = await ctx.prisma.emailOptOut.findUnique({
        where: { email_organizationId: { email: toEmail, organizationId: ctx.organizationId } },
        select: { id: true },
      });
      if (optOut) {
        throw new TRPCError({ code: "CONFLICT", message: "This email address has opted out." });
      }

      const physicalAddress = process.env.SENDER_PHYSICAL_ADDRESS ?? "";
      const canSpamErrors = validateCanSpam({
        subject: draft.subject,
        body: draft.body,
        physicalAddress,
        unsubscribeUrl: unsubscribeUrl(draft.unsubscribeToken),
      });
      if (canSpamErrors.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: canSpamErrors.join(" ") });
      }

      const senderName = process.env.SENDER_NAME ?? "OpenCRM";
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? "";

      const r = resendClient();
      const { data: sent, error: sendError } = await r.emails.send({
        from: `${senderName} <${fromEmail}>`,
        to: [toEmail],
        subject: draft.subject,
        text: draft.body,
      });

      if (sendError || !sent?.id) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (sendError as { message?: string } | null)?.message ?? "Failed to send email.",
        });
      }

      await ctx.prisma.emailDraft.update({
        where: { id: input.id },
        data: { status: EmailDraftStatus.SENT, resendMessageId: sent.id, sentAt: new Date() },
      });

      await ctx.prisma.emailEvent.create({
        data: { draftId: input.id, event: "sent", data: { resend_id: sent.id } },
      });

      void logActivity(ctx.prisma, {
        leadId: draft.leadId,
        userId: ctx.session.user.id,
        type: ActivityType.EMAIL_SENT,
        description: `Outreach email sent to ${toEmail}`,
        organizationId: ctx.organizationId,
      });

      return { messageId: sent.id };
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
});
