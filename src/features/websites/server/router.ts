import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const WEBSITE_TEMPLATES = ["local_service", "barbershop", "modern_professional"] as const;
export type WebsiteTemplate = (typeof WEBSITE_TEMPLATES)[number];

type Lead = {
  company?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  city?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  source?: string | null;
  callNotes?: string | null;
  notes?: Array<{ content: string }>;
};

type WebsiteContent = {
  hero: { title: string; tagline: string; cta: string };
  about: { heading: string; body: string };
  services: Array<{ title: string; description: string }>;
  contact: { phone: string; email: string; address: string; mapUrl?: string };
  footer: { tagline: string };
};

function fillContent(lead: Lead, template: WebsiteTemplate): WebsiteContent & { title: string } {
  const businessName = lead.company || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Your Business";
  const city = lead.city || "your area";
  const phone = lead.phone || "";
  const email = lead.email || "";
  const rating = lead.rating ? `${lead.rating.toFixed(1)} ★` : "";
  const reviewText = lead.reviewCount ? ` (${lead.reviewCount} reviews)` : "";
  const noteSnippet = lead.notes?.[0]?.content?.slice(0, 200) ?? lead.callNotes?.slice(0, 200) ?? "";

  const baseAbout = noteSnippet
    ? `${businessName} has been proudly serving ${city}. ${noteSnippet}`
    : `${businessName} is a trusted local business proudly serving ${city} and surrounding areas. We're committed to quality service and customer satisfaction.`;

  if (template === "local_service") {
    return {
      title: `${businessName} — Local Service`,
      hero: {
        title: businessName,
        tagline: `Trusted local service in ${city}${rating ? ` · ${rating}${reviewText}` : ""}`,
        cta: "Get a Free Quote",
      },
      about: {
        heading: `About ${businessName}`,
        body: baseAbout,
      },
      services: [
        { title: "Residential Service", description: "Professional service for homeowners." },
        { title: "Commercial Service", description: "Reliable solutions for businesses." },
        { title: "Emergency Response", description: "Available when you need us most." },
      ],
      contact: { phone, email, address: city },
      footer: { tagline: `© ${new Date().getFullYear()} ${businessName}. All rights reserved.` },
    };
  }

  if (template === "barbershop") {
    return {
      title: `${businessName} — Barbershop & Salon`,
      hero: {
        title: businessName,
        tagline: `Premium cuts & styling in ${city}${rating ? ` · ${rating}${reviewText}` : ""}`,
        cta: "Book an Appointment",
      },
      about: {
        heading: `Welcome to ${businessName}`,
        body: baseAbout,
      },
      services: [
        { title: "Classic Haircut", description: "Precision cuts styled to perfection." },
        { title: "Beard Trim & Shape", description: "Expert beard grooming services." },
        { title: "Hair Color", description: "Full color, highlights, and balayage." },
        { title: "Kids Cuts", description: "Fun, stress-free cuts for little ones." },
      ],
      contact: { phone, email, address: city },
      footer: { tagline: `© ${new Date().getFullYear()} ${businessName}. Walk-ins welcome.` },
    };
  }

  // modern_professional
  return {
    title: `${businessName} — Professional Services`,
    hero: {
      title: businessName,
      tagline: `Expert professional services in ${city}${rating ? ` · ${rating}${reviewText}` : ""}`,
      cta: "Schedule a Consultation",
    },
    about: {
      heading: `Why Choose ${businessName}`,
      body: baseAbout,
    },
    services: [
      { title: "Consulting", description: "Strategic guidance tailored to your needs." },
      { title: "Implementation", description: "Hands-on support from start to finish." },
      { title: "Ongoing Support", description: "We're here long after the project is done." },
    ],
    contact: { phone, email, address: city },
    footer: { tagline: `© ${new Date().getFullYear()} ${businessName}. Professional · Reliable · Results-driven.` },
  };
}

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
    .input(z.object({ leadId: z.string(), template: z.enum(WEBSITE_TEMPLATES) }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findFirst({
        where: { id: input.leadId, organizationId: ctx.organizationId },
        include: { notes: { take: 3, orderBy: { createdAt: "desc" } } },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });

      const content = fillContent(lead, input.template);
      const { title, ...sections } = content;

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
      // Verify ownership
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
