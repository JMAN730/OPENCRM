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
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

const model = () => process.env.AI_MODEL ?? "gpt-4o-mini";

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
  if (!raw) throw new Error("OpenAI returned no demo content.");
  return JSON.parse(raw) as DemoContent;
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
  if (!raw) throw new Error("OpenAI returned no email copy.");
  return JSON.parse(raw) as EmailCopy;
}
