import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { TEMPLATE_IDS, getTemplate } from "@/features/websites/templates";
import { generateDemoContent } from "@/lib/ai";
import { slugify, uniqueSlug } from "@/lib/slug";
import { logActivity, ActivityType } from "@/server/activity";
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

      const content = await generateDemoContent(lead).catch((err: unknown) => {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Failed to generate demo content.",
        });
      });

      const base = slugify(lead.company, lead.city);
      const slug = await uniqueSlug(base, async (s) => {
        const hit = await ctx.prisma.generatedWebsite.findUnique({ where: { slug: s }, select: { id: true } });
        return hit !== null;
      });

      const existing = await ctx.prisma.generatedWebsite.findFirst({
        where: { leadId: input.leadId, template: "ai_demo" },
        select: { id: true, slug: true },
      });

      // Photo enrichment
      const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
      const businessName = lead.company ?? [lead.firstName, lead.lastName].filter(Boolean).join(" ");
      let needsPhotos = true;

      if (lead.mapsUrl && googleApiKey) {
        const { fetchPlacePhotos } = await import("@/lib/places");
        content.photos = await fetchPlacePhotos(businessName, lead.city, googleApiKey);
        if (content.photos.length > 0) needsPhotos = false;
      } else if (lead.mapsUrl) {
        content.googleMapsUrl = lead.mapsUrl;
        needsPhotos = false;
      }

      const jsonContent = content as unknown as Prisma.InputJsonValue;
      const result = existing
        ? await ctx.prisma.generatedWebsite.update({
            where: { id: existing.id },
            data: {
              content: jsonContent,
              title: (lead.company ?? "Demo") + " — Demo Site",
              organizationId: ctx.organizationId,
              // Preserve the existing slug so outbound tracking links stay stable
              slug: existing.slug ?? slug,
            },
          })
        : await ctx.prisma.generatedWebsite.create({
            data: {
              leadId: input.leadId,
              template: "ai_demo",
              title: (lead.company ?? "Demo") + " — Demo Site",
              content: jsonContent,
              slug,
              organizationId: ctx.organizationId,
            },
          });

      void logActivity(ctx.prisma, {
        leadId: input.leadId,
        userId: ctx.session.user.id,
        type: ActivityType.DEMO_GENERATED,
        description: `AI demo site generated (slug: ${result.slug})`,
        organizationId: ctx.organizationId,
      });

      return { ...result, needsPhotos };
    }),

  update: organizationProcedure
    .input(
      z.object({
        id: z.string(),
        content: z.object({
          hero: z.object({ title: z.string().max(200), tagline: z.string().max(500), cta: z.string().max(100) }),
          about: z.object({ heading: z.string().max(200), body: z.string().max(5000) }),
          services: z.array(z.object({ title: z.string().max(200), description: z.string().max(2000) })).max(50),
          contact: z.object({ phone: z.string().max(50), email: z.string().max(200), address: z.string().max(500) }),
          footer: z.object({ tagline: z.string().max(500) }),
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
