import type { DemoContent } from "@/lib/ai";
import { packForCategory, type PackTheme, type TemplatePack } from "./packs";

/**
 * The single source of truth for what a generated demo site says and shows.
 * Both renderers — the live React page (DemoTemplate) and the static HTML
 * export (renderDemoHtml) — are thin adapters over this view: every
 * derivation (headline splitting, tel: links, fallbacks) and every piece of
 * shared copy lives here, so the two sites cannot drift apart.
 *
 * Design (theme, section copy, fallback photos) comes from the lead's
 * Template Pack, resolved from `category` (see packs.ts).
 */

export type DemoViewInput = {
  businessName: string;
  phone: string | null;
  city: string | null;
  category: string | null;
  content: DemoContent;
  /** Real Google rating/review count when the scraper captured them. */
  rating?: number | null;
  reviewCount?: number | null;
  /** Optional overrides (the live page passes fresher values than content). */
  photos?: string[];
  googleMapsUrl?: string;
};

export type DemoView = {
  packId: string;
  theme: PackTheme;
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
  /** Lead photos, falling back to the pack's curated set; may be empty. */
  photos: string[];
  googleMapsUrl: string | undefined;
  /** Google Maps embed URL for the contact section iframe. */
  mapEmbedUrl: string;
  /** Header pill: "Call Now" with a phone, otherwise the AI CTA. */
  headerCta: string;
  cta: string;
  subheadline: string;
  heroMeta: { label: string; value: string }[];
  /** Header nav / footer label for the gallery section. */
  galleryNavLabel: string;
  galleryTileLabels: [string, string];
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
  const pack: TemplatePack = packForCategory(input.category);
  const businessName = input.businessName || "Demo Site";
  const specialty = input.category || pack.copy.specialtyFallback;
  const serviceArea = input.city || "Local area";
  const phone = input.phone;
  const leadPhotos = (input.photos ?? content.photos ?? []).filter(Boolean);
  const photos = leadPhotos.length > 0 ? leadPhotos : pack.photos;
  const googleMapsUrl = input.googleMapsUrl ?? content.googleMapsUrl;
  const services = content.services;
  const marqueeServices = services.length > 0 ? services : [specialty];

  return {
    packId: pack.id,
    theme: pack.theme,
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
    galleryNavLabel: pack.copy.galleryNavLabel,
    galleryTileLabels: pack.copy.galleryTileLabels,
    sections: {
      services: {
        kicker: `/ 01 - ${pack.copy.servicesKickerLabel}`,
        title: pack.copy.servicesTitle,
        body: content.city_body_copy,
      },
      why: {
        kicker: `/ 02 - ${pack.copy.whyKickerLabel}`,
        titleLines: pack.copy.whyTitleLines,
        accentLine: pack.copy.whyAccentLine,
        body: `${content.local_seo_headline} ${content.city_body_copy}`,
      },
      gallery: {
        kicker: `/ 03 - ${pack.copy.galleryKickerLabel}`,
        title: pack.copy.galleryTitle,
        body: pack.copy.galleryBody,
      },
      reviews: {
        kicker: `/ 04 - ${pack.copy.reviewsKickerLabel}`,
        title: pack.copy.reviewsTitle,
      },
      contact: {
        kicker: `/ 05 - ${pack.copy.contactKickerLabel}`,
        title: pack.copy.contactTitle,
        body: content.contact_body,
      },
    },
    serviceCardBlurb: pack.copy.serviceCardBlurb,
    viewServicesLabel: "View services",
    whyPhotoCaption: pack.copy.whyPhotoCaption,
    reviewsBadge: buildReviewsBadge(input.rating, input.reviewCount),
    reviewerLabel: "Local customer",
    stats: pack.copy.stats,
    testimonials: content.testimonials,
    contactBlocks: [
      { label: "Business", value: businessName, sub: specialty },
      { label: "Phone", value: phone ?? "Add phone number", sub: "Fastest response during business hours." },
      { label: "Area", value: serviceArea, sub: content.contact_heading },
    ],
    footer: {
      tagline: `${specialty} in ${serviceArea}. Demo website, not an official site of this business.`,
      serviceLinks: marqueeServices.slice(0, 4),
      shopLinks: ["About", pack.copy.galleryNavLabel, "Reviews", "Contact"],
      contactValue: phone ?? content.cta,
      attribution: "Demo website preview",
      stamp: `${new Date().getFullYear()} · ClientCore`,
    },
  };
}

/**
 * Real Google rating when the scraper captured it — the owner recognizes
 * their own numbers. Neutral demo badge otherwise.
 */
function buildReviewsBadge(
  rating: number | null | undefined,
  reviewCount: number | null | undefined,
): DemoView["reviewsBadge"] {
  if (typeof rating === "number" && Number.isFinite(rating) && rating > 0) {
    const clamped = Math.min(5, Math.max(0, rating));
    const filled = Math.round(clamped);
    return {
      score: clamped.toFixed(1),
      stars: "★".repeat(filled) + "☆".repeat(5 - filled),
      note:
        typeof reviewCount === "number" && reviewCount > 0
          ? `${reviewCount} Google reviews`
          : "Google rating",
    };
  }
  return { score: "5.0", stars: "★★★★★", note: "Demo reviews" };
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
