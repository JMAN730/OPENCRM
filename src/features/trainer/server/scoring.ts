import OpenAI from "openai";
import { z } from "zod";
import type { Scorecard, TranscriptEntry } from "../types";

function client() {
  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });
}

const model = () => process.env.AI_MODEL ?? "deepseek-chat";

const SCORECARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overallScore", "opening", "objectionHandling", "valueProposition", "callToAction", "highlights", "improvements"],
  properties: {
    overallScore: { type: "number" },
    opening: { type: "object", required: ["score", "feedback"], properties: { score: { type: "number" }, feedback: { type: "string" } } },
    objectionHandling: { type: "object", required: ["score", "feedback"], properties: { score: { type: "number" }, feedback: { type: "string" } } },
    valueProposition: { type: "object", required: ["score", "feedback"], properties: { score: { type: "number" }, feedback: { type: "string" } } },
    callToAction: { type: "object", required: ["score", "feedback"], properties: { score: { type: "number" }, feedback: { type: "string" } } },
    highlights: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM = `You are a cold-calling coach. Score the rep (role "user") on a practice call against an AI prospect (role "agent"). All scores are integers 0-100. Be specific and constructive. Return only valid JSON matching this JSON schema: `;

const scoreCategory = z.object({ score: z.number(), feedback: z.string() });
const scorecardValidator = z.object({
  overallScore: z.number(),
  opening: scoreCategory,
  objectionHandling: scoreCategory,
  valueProposition: scoreCategory,
  callToAction: scoreCategory,
  highlights: z.array(z.string()),
  improvements: z.array(z.string()),
});

export async function scoreCall(args: {
  transcript: TranscriptEntry[];
  personaName: string;
  leadName: string;
}): Promise<Scorecard | null> {
  if (!process.env.DEEPSEEK_API_KEY) return null;

  const completion = await client().chat.completions.create({
    model: model(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM + JSON.stringify(SCORECARD_SCHEMA) },
      { role: "user", content: JSON.stringify({ persona: args.personaName, lead: args.leadName, transcript: args.transcript }) },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = scorecardValidator.safeParse(parsed);
  return result.success ? (result.data as Scorecard) : null;
}
