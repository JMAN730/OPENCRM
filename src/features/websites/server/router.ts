import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { TEMPLATE_IDS, getTemplate } from "@/features/websites/templates";
import { generateWebsiteForLead } from "@/features/websites/server/service";
import { assertWithinRateLimit } from "@/lib/rateLimit";

export const websitesRouter = createTRPCRouter({
  getForLead: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.generatedWebsite.findFirst({
        where: { leadId: input.leadId, lead: { organizationId: ctx.organizationId } },
        orderBy: { createdAt: "desc" },
      });
    }),

  generate: organizationProcedure
    .input(z.object({ leadId: z.string(), template: z.enum(TEMPLATE_IDS) }))
    .mutation(async ({ ctx, input }) => {
      const template = getTemplate(input.template);
      if (!template) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown template." });

      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, organizationId: ctx.organizationId },
        include: { notes: { take: 3, orderBy: { createdAt: "desc" } } },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });

      const { title, ...sections } = template.fillContent(lead);

      const existing = await ctx.prisma.generatedWebsite.findFirst({
        where: { leadId: input.leadId },
      });

      if (existing) {
        return ctx.prisma.generatedWebsite.update({
          where: { id: existing.id },
          data: {
            template: input.template,
            title,
            content: sections,
            organizationId: ctx.organizationId,
          },
        });
      }

      return ctx.prisma.generatedWebsite.create({
        data: {
          leadId: input.leadId,
          template: input.template,
          title,
          content: sections,
          organizationId: ctx.organizationId,
        },
      });
    }),

  generateAi: organizationProcedure
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertWithinRateLimit({
        key: `demo-gen:${ctx.organizationId}:${input.leadId}`,
        limit: 5,
        windowSeconds: 60,
      });

      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, organizationId: ctx.organizationId },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });

      const { website, needsPhotos } = await generateWebsiteForLead(ctx.prisma, lead, {
        organizationId: ctx.organizationId,
        userId: ctx.session.user.id,
      }).catch((err: unknown) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Failed to generate demo content.",
        });
      });

      return { ...website, needsPhotos };
    }),

  update: organizationProcedure
    .input(
      z.object({
        id: z.string(),
        content: z.object({
          hero: z.object({ title: z.string(), tagline: z.string(), cta: z.string() }),
          about: z.object({ heading: z.string(), body: z.string() }),
          services: z.array(z.object({ title: z.string(), description: z.string() })),
          contact: z.object({ phone: z.string(), email: z.string(), address: z.string() }),
          footer: z.object({ tagline: z.string() }),
        }),
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.generatedWebsite.findFirst({
        where: { id: input.id, lead: { organizationId: ctx.organizationId } },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.generatedWebsite.update({
        where: { id: input.id },
        data: {
          content: input.content,
          ...(input.title ? { title: input.title } : {}),
        },
      });
    }),

  delete: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.generatedWebsite.findFirst({
        where: { id: input.id, lead: { organizationId: ctx.organizationId } },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.generatedWebsite.delete({ where: { id: input.id } });
    }),

  setPhotos: organizationProcedure
    .input(z.object({
      id: z.string(),
      photos: z.array(z.string().url()).min(1).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.generatedWebsite.findFirst({
        where: { id: input.id, lead: { organizationId: ctx.organizationId } },
        select: { id: true, content: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const content = existing.content as Record<string, unknown>;
      return ctx.prisma.generatedWebsite.update({
        where: { id: existing.id },
        data: { content: { ...content, photos: input.photos } as Prisma.InputJsonValue },
      });
    }),
});
