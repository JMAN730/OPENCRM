import { organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { scopedLeadWhere } from "@/server/teams/scope";
import { logActivity } from "@/server/activity";
import { isManagerOrAdmin } from "@/server/authz";

/**
 * Notes-and-activity sub-resource of the leads router. Spread into
 * leadsRouter so the client procedure names stay flat
 * (trpc.leads.createNote etc.).
 */
export const leadNotesProcedures = {
  createNote: organizationProcedure
    .input(z.object({ leadId: z.string(), content: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...(await scopedLeadWhere(ctx)) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      const note = await ctx.prisma.note.create({
        data: {
          content: input.content,
          leadId: input.leadId,
          userId: ctx.session.user.id,
          organizationId: ctx.organizationId,
        },
      });
      await logActivity(ctx.prisma, {
        leadId: input.leadId,
        userId: ctx.session.user.id,
        type: "NOTE_ADDED",
        description: "Added a note",
        organizationId: ctx.organizationId,
      });
      return note;
    }),

  getNotes: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...(await scopedLeadWhere(ctx)) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      // Defense-in-depth: filter Notes by the lead's organization in addition
      // to leadId, so a leaked Note relation can't escape the org boundary
      // even if the upstream scope check is ever bypassed.
      return ctx.prisma.note.findMany({
        where: {
          leadId: input.leadId,
          lead: { organizationId: ctx.organizationId },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      });
    }),

  deleteNote: organizationProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.noteId, lead: { organizationId: ctx.organizationId } },
        select: { id: true, userId: true, leadId: true },
      });
      if (!note) throw new TRPCError({ code: "NOT_FOUND" });
      const callerId = ctx.session.user.id;
      const callerRole = ctx.session.user.role;
      if (note.userId !== callerId && !isManagerOrAdmin(callerRole)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.prisma.note.delete({ where: { id: note.id } });
      await logActivity(ctx.prisma, {
        leadId: note.leadId,
        userId: callerId,
        type: "NOTE_DELETED",
        description: "Deleted a note",
        organizationId: ctx.organizationId,
      });
      return { success: true };
    }),

  /** Returns activities for a single lead (scope-filtered). */
  getActivities: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, ...(await scopedLeadWhere(ctx)) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      // Defense-in-depth: same org join filter as getNotes.
      return ctx.prisma.activity.findMany({
        where: {
          leadId: input.leadId,
          lead: { organizationId: ctx.organizationId },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      });
    }),
};
