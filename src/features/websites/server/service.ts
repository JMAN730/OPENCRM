import { Prisma, type GeneratedWebsite, type Lead, type PrismaClient } from "@prisma/client";
import { generateDemoContent } from "@/lib/ai";
import { slugify, uniqueSlug } from "@/lib/slug";
import { fetchStockPhotos, leadPhotoQuery } from "@/lib/stockPhotos";
import { logActivity, ActivityType } from "@/server/activity";

/**
 * Generates (or regenerates) the AI demo website for a lead. Shared by the
 * `websites.generateAi` mutation and the outreach cron worker — callers are
 * responsible for rate limiting and for loading the lead org-scoped.
 */
export async function generateWebsiteForLead(
  prisma: PrismaClient,
  lead: Lead,
  opts: { organizationId: string; userId: string },
): Promise<{ website: GeneratedWebsite; needsPhotos: boolean }> {
  const content = await generateDemoContent(lead);

  const base = slugify(lead.company, lead.city);
  const slug = await uniqueSlug(base, async (s) => {
    const hit = await prisma.generatedWebsite.findUnique({ where: { slug: s }, select: { id: true } });
    return hit !== null;
  });

  const existing = await prisma.generatedWebsite.findFirst({
    where: { leadId: lead.id, template: "ai_demo" },
    select: { id: true, slug: true },
  });

  // Photo enrichment: real Places photos → category stock photos → Maps embed
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  const businessName = lead.company ?? [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  let needsPhotos = true;

  if (lead.mapsUrl && googleApiKey) {
    const { fetchPlacePhotos } = await import("@/lib/places");
    content.photos = await fetchPlacePhotos(businessName, lead.city, googleApiKey);
    if (content.photos.length > 0) needsPhotos = false;
  }
  if (needsPhotos) {
    const stock = await fetchStockPhotos(leadPhotoQuery(lead));
    if (stock.length > 0) {
      content.photos = stock;
      needsPhotos = false;
    }
  }
  if (needsPhotos && lead.mapsUrl) {
    content.googleMapsUrl = lead.mapsUrl;
    needsPhotos = false;
  }

  const jsonContent = content as unknown as Prisma.InputJsonValue;
  const website = existing
    ? await prisma.generatedWebsite.update({
        where: { id: existing.id },
        data: {
          content: jsonContent,
          title: (lead.company ?? "Demo") + " — Demo Site",
          organizationId: opts.organizationId,
          // Preserve the existing slug so outbound tracking links stay stable
          slug: existing.slug ?? slug,
        },
      })
    : await prisma.generatedWebsite.create({
        data: {
          leadId: lead.id,
          template: "ai_demo",
          title: (lead.company ?? "Demo") + " — Demo Site",
          content: jsonContent,
          slug,
          organizationId: opts.organizationId,
        },
      });

  void logActivity(prisma, {
    leadId: lead.id,
    userId: opts.userId,
    type: ActivityType.DEMO_GENERATED,
    description: `AI demo site generated (slug: ${website.slug})`,
    organizationId: opts.organizationId,
  });

  return { website, needsPhotos };
}
