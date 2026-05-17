import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { TEMPLATE_IDS, getTemplate } from "@/features/websites/templates";

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
          data: { template: input.template, title, content: sections },
        });
      }

      return ctx.prisma.generatedWebsite.create({
        data: { leadId: input.leadId, template: input.template, title, content: sections },
      });
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
});
