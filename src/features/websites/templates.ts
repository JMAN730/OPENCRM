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
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id) as [string, ...string[]];

export function getTemplate(id: string): WebsiteTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getAccentColor(id: string): string {
  return getTemplate(id)?.accentColor ?? "#1a1a2e";
}
