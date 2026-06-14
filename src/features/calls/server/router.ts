import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logActivity } from "@/server/activity";
import twilio from "twilio";

export const callsRouter = createTRPCRouter({
  generateToken: organizationProcedure.query(({ ctx }) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const appSid = process.env.TWILIO_TWIML_APP_SID;

    if (!accountSid || !apiKey || !apiSecret || !appSid) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Twilio is not configured for this workspace.",
      });
    }

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;
    const voiceGrant = new VoiceGrant({ outgoingApplicationSid: appSid, incomingAllow: false });
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: ctx.session.user.id,
      ttl: 3600,
    });
    token.addGrant(voiceGrant);
    return { token: token.toJwt() };
  }),

  logCall: organizationProcedure
    .input(z.object({
      leadId: z.string().optional(),
      status: z.enum(["BUSY", "NO_ANSWER", "CONNECTED", "FAILED", "CANCELED"]),
      duration: z.number().int().positive().optional(),
      twilioCallSid: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.leadId) {
        const lead = await ctx.prisma.lead.findUnique({
          where: { id: input.leadId },
          select: { organizationId: true },
        });

        if (!lead || lead.organizationId !== ctx.organizationId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
        }
      }

      const call = await ctx.prisma.callLog.create({
        data: {
          leadId: input.leadId,
          userId: ctx.session.user.id,
          status: input.status,
          duration: input.duration,
          twilioCallSid: input.twilioCallSid,
        },
      });

      if (input.leadId) {
        await logActivity(ctx.prisma, {
          leadId: input.leadId,
          userId: ctx.session.user.id,
          type: "CALL_LOGGED",
          description: `Logged call (${input.status.toLowerCase()}${
            input.duration ? `, ${input.duration}s` : ""
          })`,
        });
      }

      return call;
    }),

  getForLead: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { organizationId: true },
      });

      if (!lead || lead.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }

      return ctx.prisma.callLog.findMany({
        where: { leadId: input.leadId },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, image: true } },
        },
      });
    }),

  getRecent: organizationProcedure.query(({ ctx }) => {
    // Scope to the caller's own calls — the Dialer's "recent calls" is a
    // personal list, not the org-wide call history. The OR also keeps
    // lead-less calls (dialing a raw number passes no leadId) which an inner
    // join on `lead` would silently drop (#185-2).
    return ctx.prisma.callLog.findMany({
      where: {
        userId: ctx.session.user.id,
        OR: [{ leadId: null }, { lead: { organizationId: ctx.organizationId } }],
      },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        lead: { select: { firstName: true, lastName: true } },
        user: { select: { name: true, image: true } },
      },
    });
  }),
});
