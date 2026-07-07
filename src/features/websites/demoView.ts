import type { DemoContent } from "@/lib/ai";

/**
 * The single source of truth for what a generated demo site says and shows.
 * Both renderers — the live React page (DemoTemplate) and the static HTML
 * export (renderDemoHtml) — are thin adapters over this view: every
 * derivation (headline splitting, tel: links, fallbacks) and every piece of
 * shared copy lives here, so the two sites cannot drift apart.
 */

export type DemoViewInput = {
  businessName: string;
  phone: string | null;
  city: string | null;
  category: string | null;
  content: DemoContent;
  /** Optional overrides (the live page passes fresher values than content). */
  photos?: string[];
  googleMapsUrl?: string;
};

export type DemoView = {
  businessName: string;
  /** `tel:` href, or null when the business has no phone. */
  telHref: string | null;
  specialty: string;
  serviceArea: string;
  /** Headline broken into display lines (max 4). */
  headlineLines: string[];
  /** Real services; may be empty. */
  services: string[];
  /** Services with the specialty fallback — never empty (marquee, cards). */
  marqueeServices: string[];
  /** Photos with blanks removed; adapters supply their own placeholder assets. */
  photos: string[];
  googleMapsUrl: string | undefined;
  /** Google Maps embed URL for the contact section iframe. */
  mapEmbedUrl: string;
  /** Header pill: "Call Now" with a phone, otherwise the AI CTA. */
  headerCta: string;
  cta: string;
  subheadline: string;
  heroMeta: { label: string; value: string }[];
  sections: {
    services: SectionHead;
    why: {
      kicker: string;
      /** Display lines of the why-us headline; `accent` indexes the highlighted line. */
      titleLines: string[];
      accentLine: number;
      body: string;
    };
    gallery: SectionHead;
    reviews: { kicker: string; title: string };
    contact: SectionHead;
  };
  serviceCardBlurb: string;
  viewServicesLabel: string;
  whyPhotoCaption: string;
  reviewsBadge: { score: string; stars: string; note: string };
  reviewerLabel: string;
  stats: { value: string; label: string }[];
  testimonials: DemoContent["testimonials"];
  contactBlocks: { label: string; value: string; sub: string }[];
  footer: {
    tagline: string;
    serviceLinks: string[];
    shopLinks: string[];
    contactValue: string;
    attribution: string;
    stamp: string;
  };
};

type SectionHead = { kicker: string; title: string; body: string };

export function buildDemoView(input: DemoViewInput): DemoView {
  const { content } = input;
  const businessName = input.businessName || "Demo Site";
  const specialty = input.category || "Local service";
  const serviceArea = input.city || "Local area";
  const phone = input.phone;
  const photos = (input.photos ?? content.photos ?? []).filter(Boolean);
  const googleMapsUrl = input.googleMapsUrl ?? content.googleMapsUrl;
  const services = content.services;
  const marqueeServices = services.length > 0 ? services : [specialty];

  return {
    businessName,
    telHref: phone ? `tel:${phone.replace(/[^0-9+]/g, "")}` : null,
    specialty,
    serviceArea,
    headlineLines: splitHeadline(content.headline || businessName),
    services,
    marqueeServices,
    photos,
    googleMapsUrl,
    mapEmbedUrl: `https://www.google.com/maps?q=${encodeURIComponent(`${businessName} ${input.city ?? ""}`)}&output=embed`,
    headerCta: phone ? "Call Now" : content.cta,
    cta: content.cta,
    subheadline: content.subheadline,
    heroMeta: [
      { label: "Service", value: specialty },
      { label: "Area", value: serviceArea },
      { label: "Phone", value: phone ?? "Request a quote" },
    ],
    sections: {
      services: { kicker: "/ 01 - SERVICES", title: "What we fix.", body: content.city_body_copy },
      why: {
        kicker: "/ 02 - WHY US",
        titleLines: ["Big-shop work.", "Neighborhood", "honesty."],
        accentLine: 1,
        body: `${content.local_seo_headline} ${content.city_body_copy}`,
      },
      gallery: {
        kicker: "/ 03 - THE SHOP",
        title: "Drop in. Look around.",
        body: "A visual-first section for shop photos, work examples, before-and-after projects, or team shots.",
      },
      reviews: { kicker: "/ 04 - WHAT FOLKS SAY", title: "Receipts." },
      contact: { kicker: "/ 05 - VISIT", title: "Find us. Book fast.", body: content.contact_body },
    },
    serviceCardBlurb:
      "Straightforward scheduling, clear communication, and work handled by a local team.",
    viewServicesLabel: "View services",
    whyPhotoCaption: "Inside the shop",
    reviewsBadge: { score: "5.0", stars: "★★★★★", note: "Demo reviews" },
    reviewerLabel: "Local customer",
    stats: [
      { value: "Local", label: "Service area" },
      { value: "Clear", label: "Communication" },
      { value: "Fast", label: "Customer contact" },
      { value: "100%", label: "Demo ready" },
    ],
    testimonials: content.testimonials,
    contactBlocks: [
      { label: "Business", value: businessName, sub: specialty },
      { label: "Phone", value: phone ?? "Add phone number", sub: "Fastest response during business hours." },
      { label: "Area", value: serviceArea, sub: content.contact_heading },
    ],
    footer: {
      tagline: `${specialty} in ${serviceArea}. Demo website, not an official site of this business.`,
      serviceLinks: marqueeServices.slice(0, 4),
      shopLinks: ["About", "Gallery", "Reviews", "Contact"],
      contactValue: phone ?? content.cta,
      attribution: "Demo website preview",
      stamp: `${new Date().getFullYear()} · ClientCore`,
    },
  };
}

function splitHeadline(headline: string): string[] {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 4) return words.length ? words : ["Demo", "Site"];
  const lines: string[] = [];
  for (let index = 0; index < words.length; index += 2) {
    lines.push(words.slice(index, index + 2).join(" "));
  }
  return lines.slice(0, 4);
}
