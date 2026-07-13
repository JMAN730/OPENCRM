/**
 * Template Packs: per-Category demo site designs (theme, section copy, curated
 * fallback photos). The AI writes only business-specific copy; everything a
 * pack owns is deterministic design work (see docs/adr/0001).
 *
 * Matching is by `Lead.category` (never `Lead.source`, which is provenance).
 * Unknown or missing categories fall back to GENERIC_PACK.
 */

export type PackTheme = {
  /** Brand accent (buttons, kickers, highlights). */
  accent: string;
  /** Darker accent for hover states. */
  accentDark: string;
  /** Deep section background (hero, why-us). */
  deep: string;
  /** Near-black background / heading ink. */
  ink: string;
  /** Page background (light). */
  paper: string;
  /** Alternate light background (reviews, header text). */
  paperAlt: string;
};

export type PackCopy = {
  /** Shown when the lead has no category, e.g. header subtitle. */
  specialtyFallback: string;
  servicesKickerLabel: string;
  servicesTitle: string;
  whyKickerLabel: string;
  /** Display lines of the why-us headline; accentLine indexes the highlighted line. */
  whyTitleLines: string[];
  whyAccentLine: number;
  galleryKickerLabel: string;
  galleryTitle: string;
  galleryBody: string;
  /** Header nav + footer column label for the gallery section. */
  galleryNavLabel: string;
  /** Labels for the two photo tiles at the top of the gallery. */
  galleryTileLabels: [string, string];
  reviewsKickerLabel: string;
  reviewsTitle: string;
  contactKickerLabel: string;
  contactTitle: string;
  serviceCardBlurb: string;
  whyPhotoCaption: string;
  stats: { value: string; label: string }[];
};

export type TemplatePack = {
  id: string;
  label: string;
  /** Lead.category values this pack serves (matched case-insensitively). */
  categories: string[];
  theme: PackTheme;
  /** Curated photos (public asset paths) used when the lead has none of its own. */
  photos: string[];
  copy: PackCopy;
};

export const GENERIC_PACK: TemplatePack = {
  id: "generic",
  label: "Local Service",
  categories: [],
  theme: {
    accent: "#b5172a",
    accentDark: "#8e0f1f",
    deep: "#070d22",
    ink: "#0b0d14",
    paper: "#faf7f0",
    paperAlt: "#f4efe6",
  },
  photos: ["/demo-template/workshop.jpg", "/demo-template/shop-exterior.jpg"],
  copy: {
    specialtyFallback: "Local service",
    servicesKickerLabel: "SERVICES",
    servicesTitle: "What we do.",
    whyKickerLabel: "WHY US",
    whyTitleLines: ["Local pros.", "Straight", "answers."],
    whyAccentLine: 1,
    galleryKickerLabel: "OUR WORK",
    galleryTitle: "See it for yourself.",
    galleryBody:
      "A visual-first section for work examples, before-and-after projects, or team shots.",
    galleryNavLabel: "Gallery",
    galleryTileLabels: ["On the job", "The team"],
    reviewsKickerLabel: "WHAT FOLKS SAY",
    reviewsTitle: "Word travels.",
    contactKickerLabel: "GET IN TOUCH",
    contactTitle: "Reach out. Book fast.",
    serviceCardBlurb:
      "Straightforward scheduling, clear communication, and work handled by a local team.",
    whyPhotoCaption: "On the job",
    stats: [
      { value: "Local", label: "Service area" },
      { value: "Clear", label: "Communication" },
      { value: "Fast", label: "Customer contact" },
      { value: "100%", label: "Demo ready" },
    ],
  },
};

const MOBILE_MECHANICS_PACK: TemplatePack = {
  id: "mobile-mechanics",
  label: "Mobile Mechanics",
  categories: ["Mobile Mechanics", "Mobile Mechanic", "Auto Repair"],
  theme: {
    accent: "#d7263d",
    accentDark: "#a51d2f",
    deep: "#0d1b2a",
    ink: "#0b0d14",
    paper: "#faf7f0",
    paperAlt: "#f4efe6",
  },
  photos: [
    "/demo-packs/mobile-mechanics/hero.jpg",
    "/demo-packs/mobile-mechanics/work-1.jpg",
    "/demo-packs/mobile-mechanics/work-2.jpg",
    "/demo-packs/mobile-mechanics/work-3.jpg",
    "/demo-packs/mobile-mechanics/work-4.jpg",
    "/demo-packs/mobile-mechanics/work-5.jpg",
  ],
  copy: {
    specialtyFallback: "Mobile mechanic",
    servicesKickerLabel: "SERVICES",
    servicesTitle: "What we fix.",
    whyKickerLabel: "WHY US",
    whyTitleLines: ["Shop-quality work.", "Right in your", "driveway."],
    whyAccentLine: 1,
    galleryKickerLabel: "ON THE JOB",
    galleryTitle: "We come to you.",
    galleryBody:
      "Real jobs, real driveways. Repairs, diagnostics, and maintenance handled wherever the car sits.",
    galleryNavLabel: "Our Work",
    galleryTileLabels: ["On the job", "Under the hood"],
    reviewsKickerLabel: "WHAT DRIVERS SAY",
    reviewsTitle: "Receipts.",
    contactKickerLabel: "BOOK A VISIT",
    contactTitle: "We roll to you.",
    serviceCardBlurb:
      "Diagnosed and quoted before the work starts — no shop queue, no towing, no surprises.",
    whyPhotoCaption: "On the job",
    stats: [
      { value: "Mobile", label: "We come to you" },
      { value: "Same-day", label: "Availability" },
      { value: "Upfront", label: "Quotes first" },
      { value: "Warrantied", label: "Parts & labor" },
    ],
  },
};

const POWER_WASHING_PACK: TemplatePack = {
  id: "power-washing",
  label: "Power Washing",
  categories: ["Power washing Business", "Power Washing", "Pressure Washing"],
  theme: {
    accent: "#0f80c1",
    accentDark: "#0a5d8c",
    deep: "#082032",
    ink: "#0a1520",
    paper: "#f7fafc",
    paperAlt: "#e8f1f6",
  },
  photos: [
    "/demo-packs/power-washing/hero.jpg",
    "/demo-packs/power-washing/work-1.jpg",
    "/demo-packs/power-washing/work-2.jpg",
    "/demo-packs/power-washing/work-3.jpg",
    "/demo-packs/power-washing/work-4.jpg",
    "/demo-packs/power-washing/work-5.jpg",
  ],
  copy: {
    specialtyFallback: "Pressure washing",
    servicesKickerLabel: "SERVICES",
    servicesTitle: "What we wash.",
    whyKickerLabel: "WHY US",
    whyTitleLines: ["Years of grime.", "Gone in an", "afternoon."],
    whyAccentLine: 1,
    galleryKickerLabel: "BEFORE & AFTER",
    galleryTitle: "The proof is the pavement.",
    galleryBody:
      "Driveways, siding, roofs, and decks — the difference shows the moment the wand passes.",
    galleryNavLabel: "Results",
    galleryTileLabels: ["Before & after", "Fresh finish"],
    reviewsKickerLabel: "NEIGHBORS TALK",
    reviewsTitle: "Spotless record.",
    contactKickerLabel: "FREE QUOTE",
    contactTitle: "Get it gleaming.",
    serviceCardBlurb:
      "Surface-safe pressure and detergents matched to the job, with a walkthrough before we pack up.",
    whyPhotoCaption: "Mid-clean",
    stats: [
      { value: "Before/After", label: "Photo proof" },
      { value: "Eco-safe", label: "Detergents" },
      { value: "Insured", label: "And equipped" },
      { value: "Free", label: "Quotes" },
    ],
  },
};

const LANDSCAPING_PACK: TemplatePack = {
  id: "landscaping",
  label: "Landscaping",
  categories: ["Landscaping", "Landscaper", "Lawn Care"],
  theme: {
    accent: "#3a7d44",
    accentDark: "#2b5e33",
    deep: "#1b2a1e",
    ink: "#121a14",
    paper: "#f9f8f2",
    paperAlt: "#eef0e4",
  },
  photos: [
    "/demo-packs/landscaping/hero.jpg",
    "/demo-packs/landscaping/work-1.jpg",
    "/demo-packs/landscaping/work-2.jpg",
    "/demo-packs/landscaping/work-3.jpg",
    "/demo-packs/landscaping/work-4.jpg",
    "/demo-packs/landscaping/work-5.jpg",
  ],
  copy: {
    specialtyFallback: "Landscaping",
    servicesKickerLabel: "SERVICES",
    servicesTitle: "Your yard, handled.",
    whyKickerLabel: "WHY US",
    whyTitleLines: ["Crews that show up.", "Yards that", "show off."],
    whyAccentLine: 1,
    galleryKickerLabel: "THE WORK",
    galleryTitle: "Walk the lawns we keep.",
    galleryBody:
      "Mowing, beds, trimming, and full-season care — a look at yards on our regular routes.",
    galleryNavLabel: "Projects",
    galleryTileLabels: ["Recent projects", "Crew at work"],
    reviewsKickerLabel: "CURB APPEAL TALKS",
    reviewsTitle: "Growing on people.",
    contactKickerLabel: "SEASONAL PLANS",
    contactTitle: "Get on the route.",
    serviceCardBlurb:
      "Scheduled visits, tidy edges, and a crew that treats your yard like the one they park in front of.",
    whyPhotoCaption: "On the route",
    stats: [
      { value: "Seasonal", label: "Programs" },
      { value: "Licensed", label: "And insured" },
      { value: "Local", label: "Crews" },
      { value: "Free", label: "Estimates" },
    ],
  },
};

/** Niche packs; GENERIC_PACK is the fallback and not listed here. */
export const TEMPLATE_PACKS: TemplatePack[] = [
  MOBILE_MECHANICS_PACK,
  POWER_WASHING_PACK,
  LANDSCAPING_PACK,
];

export function packForCategory(category: string | null | undefined): TemplatePack {
  const needle = (category ?? "").trim().toLowerCase();
  if (!needle) return GENERIC_PACK;
  return (
    TEMPLATE_PACKS.find((pack) =>
      pack.categories.some((c) => c.toLowerCase() === needle),
    ) ?? GENERIC_PACK
  );
}

/**
 * Copy-friendly niche name: scraper categories like "Power washing Business"
 * read badly inside sentences; pack-matched categories use the pack's clean
 * specialty instead. Unmatched categories pass through as-is.
 */
export function nicheForCategory(category: string | null | undefined): string | null {
  const trimmed = (category ?? "").trim();
  if (!trimmed) return null;
  const pack = packForCategory(trimmed);
  return pack === GENERIC_PACK ? trimmed : pack.copy.specialtyFallback;
}
