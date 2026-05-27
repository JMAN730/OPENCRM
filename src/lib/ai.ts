import OpenAI from "openai";
import type { Lead } from "@prisma/client";

export interface DemoContent {
  headline: string;
  subheadline: string;
  services: string[];
  local_seo_headline: string;
  cta: string;
  contact_heading: string;
  contact_body: string;
  testimonials: Array<{ quote: string; author: string }>;
  city_body_copy: string;
}

export interface EmailCopy {
  subject: string;
  observation: string;
}

function client() {
  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });
}

const model = () => process.env.AI_MODEL ?? "deepseek-chat";

function leadDisplayName(lead: Lead) {
  const contactName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  return lead.company ?? (contactName || "Your Local Business");
}

function fallbackDemoContent(lead: Lead): DemoContent {
  const name = leadDisplayName(lead);
  const niche = lead.source ?? "local service";
  const city = lead.city ?? "the local area";
  const phone = lead.phone ? ` Call ${lead.phone} to talk through availability and next steps.` : "";
  const websiteNote = lead.website ? " The demo can be refined around the services and tone already shown online." : "";

  return {
    headline: `${name} in ${city}`,
    subheadline: `${name} helps customers in ${city} with reliable ${niche.toLowerCase()} support, clear communication, and practical next steps.`,
    services: [
      `${niche} consultations`,
      "Service estimates",
      "Repairs and maintenance",
      "Project planning",
      "Customer support",
      "Follow-up visits",
    ],
    local_seo_headline: `${name} serves ${city} and nearby communities`,
    cta: lead.phone ? "Call now" : "Request a quote",
    contact_heading: `Contact ${name}`,
    contact_body: `Reach out to discuss what you need, compare options, and schedule service in ${city}.${phone}`,
    testimonials: [
      { quote: "They were easy to reach, clear about the work, and kept everything moving.", author: "Maria R." },
      { quote: "A straightforward local team that made the process simple from the first call.", author: "James L." },
    ],
    city_body_copy: `${name} works with customers across ${city} who want dependable ${niche.toLowerCase()} service without a complicated process.${websiteNote} This demo page is designed to make the business easier to find, evaluate, and contact.`,
  };
}

const DEMO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline",
    "subheadline",
    "services",
    "local_seo_headline",
    "cta",
    "contact_heading",
    "contact_body",
    "testimonials",
    "city_body_copy",
  ],
  properties: {
    headline: { type: "string" },
    subheadline: { type: "string" },
    services: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 8 },
    local_seo_headline: { type: "string" },
    cta: { type: "string" },
    contact_heading: { type: "string" },
    contact_body: { type: "string" },
    testimonials: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quote", "author"],
        properties: {
          quote: { type: "string" },
          author: { type: "string" },
        },
      },
    },
    city_body_copy: { type: "string" },
  },
} as const;

export async function generateDemoContent(lead: Lead): Promise<DemoContent> {
  if (!process.env.DEEPSEEK_API_KEY) {
    return fallbackDemoContent(lead);
  }

  const niche = lead.source ?? "local business";
  const city = lead.city ?? "the local area";

  const completion = await client().chat.completions.create({
    model: model(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a conversion-focused copywriter for local-service small businesses. " +
          "Write warm, concrete, locally-relevant marketing copy. Avoid hype, fake claims, " +
          "and superlatives you cannot back up. Testimonials are illustrative samples for a " +
          "demo and must read as plausible everyday customers (first name + last initial). " +
          "Return only valid JSON that matches this JSON schema: " +
          JSON.stringify(DEMO_SCHEMA),
      },
      {
        role: "user",
        content: JSON.stringify({
          business_name: lead.company,
          niche,
          city,
          observation: lead.qualificationSummary,
          existing_website: lead.website,
          instructions:
            "Generate homepage copy for a demo website for this business. The local_seo_headline " +
            "should name the city. city_body_copy is 2-3 sentences referencing the city and niche. " +
            "Services are short noun phrases typical for this niche. CTA is a short action phrase.",
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("DeepSeek returned no demo content.");
  try {
    return JSON.parse(raw) as DemoContent;
  } catch {
    throw new Error("DeepSeek returned invalid demo JSON.");
  }
}

const EMAIL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "observation"],
  properties: {
    subject: { type: "string" },
    observation: { type: "string" },
  },
} as const;

export async function generateEmailCopy(lead: Lead): Promise<EmailCopy> {
  const niche = lead.source ?? "local business";
  const city = lead.city ?? "your area";

  const completion = await client().chat.completions.create({
    model: model(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You write short, honest, non-salesy cold outreach for a web designer. " +
          "The 'subject' must be truthful and specific (no clickbait, no false urgency). " +
          "The 'observation' is a single natural clause that completes the sentence " +
          "'I noticed ___,' describing something real about the business's current online " +
          "presence. Keep it grounded in the provided note; do not invent specifics. " +
          "Return only valid JSON that matches this JSON schema: " +
          JSON.stringify(EMAIL_SCHEMA),
      },
      {
        role: "user",
        content: JSON.stringify({
          business_name: lead.company,
          niche,
          city,
          note: lead.qualificationSummary,
          existing_website: lead.website,
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("DeepSeek returned no email copy.");
  return JSON.parse(raw) as EmailCopy;
}
