export type WebsiteContent = {
  hero: { title: string; tagline: string; cta: string };
  about: { heading: string; body: string };
  services: Array<{ title: string; description: string }>;
  contact: { phone: string; email: string; address: string; mapUrl?: string };
  footer: { tagline: string };
};

export type LeadForTemplate = {
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

export type WebsiteTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  accentColor: string;
  fillContent: (lead: LeadForTemplate) => WebsiteContent & { title: string };
};

function deriveBusinessName(lead: LeadForTemplate): string {
  return (
    lead.company ||
    [lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
    "Your Business"
  );
}

function deriveAboutBody(lead: LeadForTemplate, businessName: string, city: string): string {
  const snippet = lead.notes?.[0]?.content?.slice(0, 200) ?? lead.callNotes?.slice(0, 200) ?? "";
  if (snippet) return `${businessName} has been proudly serving ${city}. ${snippet}`;
  return `${businessName} is a trusted local business proudly serving ${city} and surrounding areas. We're committed to quality service and customer satisfaction.`;
}

const MECHANIC_SERVICES = [
  { title: "Oil & Fluids", description: "Conventional, synthetic blend, or full synthetic. Filter included. Top-off all fluids and a 21-point safety check." },
  { title: "Brakes", description: "Pads + rotors replaced at your location. OEM-grade parts, warrantied 12mo / 12k miles. We measure and quote before we start." },
  { title: "Batteries & Alternators", description: "Test, replace, code, and verify charging system. Old battery hauled out for recycling. Same-day availability." },
  { title: "Diagnostics", description: "Check-engine, ABS, airbag, transmission. OBD-II plus live data and component testing. Fee waived if you book the repair." },
  { title: "Starters & Ignition", description: "Click-click-nothing diagnosed and fixed on-site. Most vehicles back running in under 90 minutes." },
  { title: "Tune-Ups", description: "Spark plugs, coils, filters, throttle body — pick what you need. We bring OEM-spec parts for your year and make." },
  { title: "Pre-Purchase Inspection", description: "Buying used? We meet you at the seller, run a 120-point inspection + OBD scan, and send a written report." },
  { title: "AC Service", description: "R-134a or R-1234yf recharge with leak check and dye. Compressor and condenser quotes on the spot if needed." },
  { title: "Tires · Mount/Balance", description: "You bring the tires, we bring the balancer. Or we order them in your size and meet you with them." },
];

export const TEMPLATES: WebsiteTemplate[] = [
  {
    id: "my_template",
    name: "My Template",
    description: "Starter template — replace this with your own design and copy.",
    emoji: "🌐",
    accentColor: "#4f46e5",
    fillContent: (lead) => {
      const businessName = deriveBusinessName(lead);
      const city = lead.city || "your area";
      const phone = lead.phone || "";
      const email = lead.email || "";
      const rating = lead.rating ? `${lead.rating.toFixed(1)} ★` : "";
      const reviewText = lead.reviewCount ? ` (${lead.reviewCount} reviews)` : "";
      return {
        title: `${businessName}`,
        hero: {
          title: businessName,
          tagline: `Welcome to ${businessName} in ${city}${rating ? ` · ${rating}${reviewText}` : ""}`,
          cta: "Get in Touch",
        },
        about: {
          heading: `About ${businessName}`,
          body: deriveAboutBody(lead, businessName, city),
        },
        services: [
          { title: "Service One", description: "Describe your first service offering here." },
          { title: "Service Two", description: "Describe your second service offering here." },
          { title: "Service Three", description: "Describe your third service offering here." },
        ],
        contact: { phone, email, address: city },
        footer: { tagline: `© ${new Date().getFullYear()} ${businessName}. All rights reserved.` },
      };
    },
  },
  {
    id: "mechanic",
    name: "Mobile Mechanic",
    description: "Bold industrial design — dark amber theme with services grid, reviews, FAQ, and booking CTA.",
    emoji: "🔧",
    accentColor: "#f5a524",
    fillContent: (lead) => {
      const businessName = deriveBusinessName(lead);
      const city = lead.city || "your area";
      const phone = lead.phone || "";
      const email = lead.email || "";
      return {
        title: businessName,
        hero: {
          title: businessName,
          tagline: city,
          cta: "Book a service",
        },
        about: {
          heading: `About ${businessName}`,
          body: deriveAboutBody(lead, businessName, city),
        },
        services: MECHANIC_SERVICES,
        contact: { phone, email, address: city },
        footer: { tagline: `© ${new Date().getFullYear()} ${businessName}` },
      };
    },
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id) as [string, ...string[]];

export function getTemplate(id: string): WebsiteTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getAccentColor(id: string): string {
  return getTemplate(id)?.accentColor ?? "#1a1a2e";
}
