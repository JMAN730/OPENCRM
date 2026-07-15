import { leadDisplayName } from "@/lib/leadName";

export interface LeadContextInput {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  source: string | null;
}

export interface LeadContext {
  leadName: string;
  company: string;
  industry: string;
}

/** Derives the prospect-facing context from a lead, with safe fallbacks. */
export function buildLeadContext(lead: LeadContextInput): LeadContext {
  return {
    leadName: leadDisplayName(lead, "Your Local Business"),
    company: lead.company ?? "the company",
    industry: lead.source ?? "your industry",
  };
}

/** Replaces {{leadName}}, {{company}}, {{industry}} in a template. */
export function interpolate(template: string, ctx: LeadContext): string {
  return template
    .replace(/\{\{\s*leadName\s*\}\}/g, ctx.leadName)
    .replace(/\{\{\s*company\s*\}\}/g, ctx.company)
    .replace(/\{\{\s*industry\s*\}\}/g, ctx.industry);
}
