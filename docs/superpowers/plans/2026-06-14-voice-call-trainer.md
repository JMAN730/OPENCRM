# Voice Call Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let sales reps practice cold calls against an ElevenLabs-voiced AI prospect that knows a real CRM lead, with live coaching hints and a post-call AI scorecard.

**Architecture:** A new `trainer` tRPC feature plus a client-only `/trainer` page. One shared ElevenLabs Conversational AI **agent** (created once in the ElevenLabs dashboard with overrides enabled) is connected via a server-minted signed URL; each per-org **persona** lives in our DB and is injected per call through the SDK's `overrides` (system prompt + first message + voice). The browser opens the connection with `@elevenlabs/client`, streams transcript turns (driving a client-side regex hint engine), then sends the transcript to the server which scores it with DeepSeek (mirroring the existing `src/lib/ai.ts` integration) and persists a `TrainingSession`.

**Tech Stack:** Next.js (App Router) · tRPC · Prisma/PostgreSQL · React + Tailwind v4 · `@elevenlabs/client` · OpenAI SDK→DeepSeek · Vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-voice-call-trainer-design.md`

---

## Pre-flight conventions (read once)

- Every org-scoped read/write filters by `ctx.organizationId` (from `organizationProcedure`). Cross-org reads-by-id: `select: { organizationId: true }` then `if (!row || row.organizationId !== ctx.organizationId) throw new TRPCError({ code: "NOT_FOUND", ... })`.
- Role checks take the **role string**: `assertAdmin(ctx.session.user.role)` (from `@/server/authz`).
- Lead model has **no `industry` field** — use `lead.source`. Display name is derived (see Task 3 `buildLeadContext`).
- Commit after each task. Branch is already `feat/voice-call-trainer`.
- `.gitignore` currently ignores `/docs/superpowers/` — resolve git-tracking of these docs per the decision recorded at hand-off; it does not affect source under `src/`.

---

## File Structure

**Create:**
- `src/features/trainer/types.ts` — shared types (`TranscriptEntry`, `Scorecard`, `StartSessionResult`, `PersonaInput`).
- `src/features/trainer/voices.ts` — `ELEVENLABS_VOICES` constant.
- `src/features/trainer/hints.ts` — `HINT_PATTERNS`, `matchHint()`.
- `src/features/trainer/hints.test.ts`
- `src/features/trainer/leadContext.ts` — `buildLeadContext()`, `interpolate()`.
- `src/features/trainer/leadContext.test.ts`
- `src/features/trainer/server/scoring.ts` — `SCORECARD_SCHEMA`, `scoreCall()`.
- `src/features/trainer/server/scoring.test.ts`
- `src/features/trainer/server/router.ts` — `trainerRouter`.
- `src/features/trainer/server/router.test.ts`
- `src/features/trainer/components/PersonaManagerDialog.tsx`
- `src/features/trainer/components/TrainerCall.tsx`
- `src/features/trainer/components/TrainerPanel.tsx`
- `src/app/trainer/page.tsx`

**Modify:**
- `prisma/schema.prisma` — 2 models + 3 back-relations.
- `src/test/trpc.ts` — add 2 model maps to `createMockPrisma()`.
- `src/server/api/root.ts` — register `trainer`.
- `src/components/layout/Sidebar.tsx` — nav entry.
- `src/features/leads/components/lead-list/LeadModal.tsx` — "Practice Call" button.
- `.env.example`, `README.md` — env vars + ElevenLabs setup.

---

## Task 1: Prisma models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the two models** at the end of `prisma/schema.prisma`:

```prisma
model TrainingPersona {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name           String
  description    String
  systemPrompt   String       @db.Text
  firstMessage   String
  voiceId        String
  voiceName      String
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  sessions       TrainingSession[]

  @@index([organizationId])
}

model TrainingSession {
  id              String           @id @default(cuid())
  organizationId  String
  organization    Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId          String
  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  leadId          String
  lead            Lead             @relation(fields: [leadId], references: [id], onDelete: Cascade)
  personaId       String?
  persona         TrainingPersona? @relation(fields: [personaId], references: [id], onDelete: SetNull)
  transcript      Json
  scorecard       Json?
  durationSeconds Int?
  createdAt       DateTime         @default(now())

  @@index([organizationId, userId])
  @@index([organizationId, createdAt])
  @@index([leadId])
}
```

- [ ] **Step 2: Add back-relations.** In `model Organization`, add to the relation list:

```prisma
  trainingPersonas TrainingPersona[]
  trainingSessions TrainingSession[]
```

In `model User`, add:

```prisma
  trainingSessions TrainingSession[]
```

In `model Lead`, add:

```prisma
  trainingSessions TrainingSession[]
```

- [ ] **Step 3: Validate + push schema**

Run: `npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

Run: `npx prisma db push`
Expected: tables `TrainingPersona` and `TrainingSession` created; "Your database is now in sync".

Run: `npx prisma generate`
Expected: client regenerated (no error).

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(trainer): add TrainingPersona and TrainingSession models"
```

---

## Task 2: Extend the test harness

`createMockPrisma()` has no maps for the new models; router tests would throw "cannot read properties of undefined".

**Files:**
- Modify: `src/test/trpc.ts`

- [ ] **Step 1: Add model maps.** Inside the object returned by `createMockPrisma()` (alongside the other `vi.fn()` model maps), add:

```typescript
    trainingPersona: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    trainingSession: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/test/trpc.ts
git commit -m "test(trainer): add training models to mock prisma"
```

---

## Task 3: Shared types, voices, hints, lead-context (pure modules, TDD)

**Files:**
- Create: `src/features/trainer/types.ts`
- Create: `src/features/trainer/voices.ts`
- Create: `src/features/trainer/hints.ts` + `src/features/trainer/hints.test.ts`
- Create: `src/features/trainer/leadContext.ts` + `src/features/trainer/leadContext.test.ts`

- [ ] **Step 1: Write `types.ts`**

```typescript
export interface TranscriptEntry {
  role: "user" | "agent";
  text: string;
  at: number;
}

export interface ScoreCategory {
  score: number;
  feedback: string;
}

export interface Scorecard {
  overallScore: number;
  opening: ScoreCategory;
  objectionHandling: ScoreCategory;
  valueProposition: ScoreCategory;
  callToAction: ScoreCategory;
  highlights: string[];
  improvements: string[];
}

export interface StartSessionOverrides {
  agent: {
    prompt: { prompt: string };
    firstMessage: string;
    language: string;
  };
  tts: { voiceId: string };
}

export interface StartSessionResult {
  signedUrl: string;
  overrides: StartSessionOverrides;
}

export interface PersonaInput {
  name: string;
  description: string;
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  voiceName: string;
}
```

- [ ] **Step 2: Write `voices.ts`** (curated ElevenLabs prebuilt voices — stable public IDs)

```typescript
/** Curated ElevenLabs prebuilt voices admins can assign to a persona. */
export const ELEVENLABS_VOICES: ReadonlyArray<{ id: string; name: string }> = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (calm female)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (soft female)" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (deep male)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh (young male)" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold (assertive male)" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni (warm male)" },
];
```

- [ ] **Step 3: Write the failing hints test** `hints.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { matchHint } from "./hints";

describe("matchHint", () => {
  it("returns the price-objection hint when price is mentioned", () => {
    expect(matchHint("Honestly your price is too expensive")).toMatch(/ROI/);
  });
  it("returns the not-interested hint", () => {
    expect(matchHint("I'm really not interested")).toMatch(/open question/i);
  });
  it("returns null when nothing matches", () => {
    expect(matchHint("Sure, tell me more about that")).toBeNull();
  });
  it("is case-insensitive", () => {
    expect(matchHint("SEND ME AN EMAIL")).toMatch(/value statement/i);
  });
});
```

- [ ] **Step 4: Run it — verify it fails**

Run: `npx vitest run src/features/trainer/hints.test.ts`
Expected: FAIL ("Cannot find module './hints'").

- [ ] **Step 5: Write `hints.ts`**

```typescript
export interface HintPattern {
  pattern: RegExp;
  hint: string;
}

export const HINT_PATTERNS: HintPattern[] = [
  { pattern: /price|cost|expensive|budget/i, hint: "Price objection — pivot to ROI, don't defend the number" },
  { pattern: /not interested/i, hint: "Ask an open question to uncover the real objection" },
  { pattern: /send.*(email|info|brochure)/i, hint: "Brush-off — give a value statement before agreeing" },
  { pattern: /not the right person|talk to/i, hint: "Ask who handles decisions for this area" },
  { pattern: /call me back|bad time/i, hint: "Secure a specific callback time before you hang up" },
  { pattern: /already.*(use|have|work with)/i, hint: "Ask what they'd change about their current solution" },
];

/** Returns the hint for the first matching pattern, or null. */
export function matchHint(text: string): string | null {
  for (const { pattern, hint } of HINT_PATTERNS) {
    if (pattern.test(text)) return hint;
  }
  return null;
}
```

- [ ] **Step 6: Run hints test — verify pass**

Run: `npx vitest run src/features/trainer/hints.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Write the failing leadContext test** `leadContext.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { buildLeadContext, interpolate } from "./leadContext";

const baseLead = { company: null, firstName: null, lastName: null, source: null };

describe("buildLeadContext", () => {
  it("prefers company for the lead name", () => {
    expect(buildLeadContext({ ...baseLead, company: "Acme" }).leadName).toBe("Acme");
  });
  it("falls back to first + last name", () => {
    expect(buildLeadContext({ ...baseLead, firstName: "John", lastName: "Smith" }).leadName).toBe("John Smith");
  });
  it("falls back to a generic name when nothing is set", () => {
    expect(buildLeadContext(baseLead).leadName).toBe("Your Local Business");
  });
  it("maps source to industry with a fallback", () => {
    expect(buildLeadContext({ ...baseLead, source: "Plumbing" }).industry).toBe("Plumbing");
    expect(buildLeadContext(baseLead).industry).toBe("your industry");
  });
  it("uses 'the company' fallback for company", () => {
    expect(buildLeadContext(baseLead).company).toBe("the company");
  });
});

describe("interpolate", () => {
  it("replaces all placeholders", () => {
    const out = interpolate("Hi, this is {{leadName}} at {{company}} in {{industry}}", {
      leadName: "Acme", company: "Acme", industry: "Plumbing",
    });
    expect(out).toBe("Hi, this is Acme at Acme in Plumbing");
  });
});
```

- [ ] **Step 8: Run it — verify it fails**

Run: `npx vitest run src/features/trainer/leadContext.test.ts`
Expected: FAIL ("Cannot find module './leadContext'").

- [ ] **Step 9: Write `leadContext.ts`**

```typescript
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
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  const leadName = lead.company ?? (fullName || "Your Local Business");
  return {
    leadName,
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
```

- [ ] **Step 10: Run leadContext test — verify pass**

Run: `npx vitest run src/features/trainer/leadContext.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/features/trainer/types.ts src/features/trainer/voices.ts src/features/trainer/hints.ts src/features/trainer/hints.test.ts src/features/trainer/leadContext.ts src/features/trainer/leadContext.test.ts
git commit -m "feat(trainer): shared types, voices, hint engine, lead-context helpers"
```

---

## Task 4: Scoring helper (DeepSeek, mirrors src/lib/ai.ts)

**Files:**
- Create: `src/features/trainer/server/scoring.ts`
- Create: `src/features/trainer/server/scoring.test.ts`

- [ ] **Step 1: Write the failing test** `scoring.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({ chat: { completions: { create } } })),
}));

import { scoreCall } from "./scoring";
import type { Scorecard } from "../types";

const sample: Scorecard = {
  overallScore: 72,
  opening: { score: 80, feedback: "Clear intro." },
  objectionHandling: { score: 65, feedback: "Defended price." },
  valueProposition: { score: 70, feedback: "Decent." },
  callToAction: { score: 55, feedback: "No next step." },
  highlights: ["Good tone"],
  improvements: ["Ask for the meeting"],
};

describe("scoreCall", () => {
  afterEach(() => { vi.unstubAllEnvs(); create.mockReset(); });

  it("returns null when no API key is configured", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const result = await scoreCall({ transcript: [], personaName: "P", leadName: "L" });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("parses the DeepSeek JSON response into a scorecard", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "key");
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(sample) } }] });
    const result = await scoreCall({
      transcript: [{ role: "agent", text: "Hello?", at: 1 }],
      personaName: "Skeptical Owner",
      leadName: "Acme",
    });
    expect(result).toEqual(sample);
    expect(create).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/features/trainer/server/scoring.test.ts`
Expected: FAIL ("Cannot find module './scoring'").

- [ ] **Step 3: Write `scoring.ts`**

```typescript
import OpenAI from "openai";
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
  return JSON.parse(raw) as Scorecard;
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `npx vitest run src/features/trainer/server/scoring.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/trainer/server/scoring.ts src/features/trainer/server/scoring.test.ts
git commit -m "feat(trainer): DeepSeek scoring helper with no-key fallback"
```

---

## Task 5: Trainer router — persona CRUD + registration

**Files:**
- Create: `src/features/trainer/server/router.ts`
- Create: `src/features/trainer/server/router.test.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Write the failing test** `router.test.ts` (persona CRUD section)

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestCaller } from "@/test/trpc";

const { create: openaiCreate } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({ chat: { completions: { create: openaiCreate } } })),
}));

const validPersona = {
  name: "Skeptical Owner",
  description: "Defensive, busy",
  systemPrompt: "You are {{leadName}} at {{company}} in {{industry}}.",
  firstMessage: "Hello?",
  voiceId: "21m00Tcm4TlvDq8ikWAM",
  voiceName: "Rachel (calm female)",
};

describe("trainerRouter — personas", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => { ({ caller, prisma } = createTestCaller()); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("lists personas for the caller's org", async () => {
    prisma.trainingPersona.findMany.mockResolvedValue([{ id: "p1" }]);
    const result = await caller.trainer.listPersonas();
    expect(result).toEqual([{ id: "p1" }]);
    expect(prisma.trainingPersona.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
  });

  it("creates a persona as ADMIN", async () => {
    prisma.trainingPersona.create.mockResolvedValue({ id: "p1", ...validPersona });
    await caller.trainer.createPersona(validPersona);
    expect(prisma.trainingPersona.create).toHaveBeenCalledWith({
      data: { ...validPersona, organizationId: "org-1" },
    });
  });

  it("forbids non-admins from creating", async () => {
    ({ caller, prisma } = createTestCaller({ sessionOverrides: { role: "USER" } }));
    await expect(caller.trainer.createPersona(validPersona)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects update of a persona from another org", async () => {
    prisma.trainingPersona.findUnique.mockResolvedValue({ organizationId: "org-2" });
    await expect(caller.trainer.updatePersona({ id: "p1", ...validPersona }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes a persona in the caller's org", async () => {
    prisma.trainingPersona.findUnique.mockResolvedValue({ organizationId: "org-1" });
    prisma.trainingPersona.delete.mockResolvedValue({ id: "p1" });
    await caller.trainer.deletePersona({ id: "p1" });
    expect(prisma.trainingPersona.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/features/trainer/server/router.test.ts`
Expected: FAIL ("Cannot find module './router'" / `caller.trainer` undefined).

- [ ] **Step 3: Write `router.ts`** (persona CRUD; session procedures added in Tasks 6–7)

```typescript
import { createTRPCRouter, organizationProcedure } from "@/server/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { assertAdmin, isManagerOrAdmin } from "@/server/authz";
import { assertWithinRateLimit } from "@/lib/rateLimit";
import { getLeadScope, leadWhereFromScope } from "@/server/teams/scope";
import { buildLeadContext, interpolate } from "../leadContext";
import { scoreCall } from "./scoring";

const personaInput = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  firstMessage: z.string().min(1),
  voiceId: z.string().min(1),
  voiceName: z.string().min(1),
});

export const trainerRouter = createTRPCRouter({
  listPersonas: organizationProcedure.query(({ ctx }) =>
    ctx.prisma.trainingPersona.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "asc" },
    }),
  ),

  createPersona: organizationProcedure
    .input(personaInput)
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session.user.role);
      return ctx.prisma.trainingPersona.create({
        data: { ...input, organizationId: ctx.organizationId },
      });
    }),

  updatePersona: organizationProcedure
    .input(personaInput.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session.user.role);
      const existing = await ctx.prisma.trainingPersona.findUnique({
        where: { id: input.id },
        select: { organizationId: true },
      });
      if (!existing || existing.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found." });
      }
      const { id, ...data } = input;
      return ctx.prisma.trainingPersona.update({ where: { id }, data });
    }),

  deletePersona: organizationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.session.user.role);
      const existing = await ctx.prisma.trainingPersona.findUnique({
        where: { id: input.id },
        select: { organizationId: true },
      });
      if (!existing || existing.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found." });
      }
      await ctx.prisma.trainingPersona.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
```

- [ ] **Step 4: Register the router.** In `src/server/api/root.ts`, add the import after the other feature imports:

```typescript
import { trainerRouter } from "@/features/trainer/server/router";
```

and add to the `createTRPCRouter({ ... })` map (after `analytics: analyticsRouter,`):

```typescript
  trainer: trainerRouter,
```

- [ ] **Step 5: Run test — verify pass**

Run: `npx vitest run src/features/trainer/server/router.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/trainer/server/router.ts src/features/trainer/server/router.test.ts src/server/api/root.ts
git commit -m "feat(trainer): persona CRUD router + registration"
```

---

## Task 6: startSession procedure (signed URL + overrides)

**Files:**
- Modify: `src/features/trainer/server/router.ts`
- Modify: `src/features/trainer/server/router.test.ts`

- [ ] **Step 1: Add the failing test** (append a `describe` block to `router.test.ts`)

```typescript
describe("trainerRouter — startSession", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => { ({ caller, prisma } = createTestCaller()); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  function stubLeadAndPersona() {
    prisma.lead.findUnique.mockResolvedValue({
      organizationId: "org-1", company: "Acme", firstName: null, lastName: null, source: "Plumbing",
    });
    prisma.trainingPersona.findUnique.mockResolvedValue({
      organizationId: "org-1",
      systemPrompt: "Talk to {{leadName}} in {{industry}}.",
      firstMessage: "Hi {{leadName}}.",
      voiceId: "voice_1",
    });
  }

  it("mints a signed url and assembles interpolated overrides", async () => {
    stubLeadAndPersona();
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    vi.stubEnv("ELEVENLABS_AGENT_ID", "agent_1");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signed_url: "wss://signed" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await caller.trainer.startSession({ leadId: "lead-1", personaId: "p1" });

    expect(result.signedUrl).toBe("wss://signed");
    expect(result.overrides.agent.prompt.prompt).toBe("Talk to Acme in Plumbing.");
    expect(result.overrides.agent.firstMessage).toBe("Hi Acme.");
    expect(result.overrides.tts.voiceId).toBe("voice_1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("get-signed-url?agent_id=agent_1"),
      expect.objectContaining({ headers: { "xi-api-key": "k" } }),
    );
  });

  it("throws PRECONDITION_FAILED when env is missing", async () => {
    stubLeadAndPersona();
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("ELEVENLABS_AGENT_ID", "");
    await expect(caller.trainer.startSession({ leadId: "lead-1", personaId: "p1" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws NOT_FOUND when the lead is in another org", async () => {
    prisma.lead.findUnique.mockResolvedValue({ organizationId: "org-2" });
    await expect(caller.trainer.startSession({ leadId: "lead-1", personaId: "p1" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/features/trainer/server/router.test.ts -t startSession`
Expected: FAIL (`startSession` is not a function).

- [ ] **Step 3: Add `startSession`** to `trainerRouter` (inside the `createTRPCRouter({ ... })` map):

```typescript
  startSession: organizationProcedure
    .input(z.object({ leadId: z.string(), personaId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { organizationId: true, company: true, firstName: true, lastName: true, source: true },
      });
      if (!lead || lead.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }

      const persona = await ctx.prisma.trainingPersona.findUnique({
        where: { id: input.personaId },
        select: { organizationId: true, systemPrompt: true, firstMessage: true, voiceId: true },
      });
      if (!persona || persona.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found." });
      }

      const apiKey = process.env.ELEVENLABS_API_KEY;
      const agentId = process.env.ELEVENLABS_AGENT_ID;
      if (!apiKey || !agentId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Voice trainer is not configured." });
      }

      const leadCtx = buildLeadContext(lead);
      const systemPrompt = interpolate(persona.systemPrompt, leadCtx);
      const firstMessage = interpolate(persona.firstMessage, leadCtx);

      const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
        { headers: { "xi-api-key": apiKey }, cache: "no-store" },
      );
      if (!res.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to start voice session." });
      }
      const { signed_url } = (await res.json()) as { signed_url: string };

      return {
        signedUrl: signed_url,
        overrides: {
          agent: { prompt: { prompt: systemPrompt }, firstMessage, language: "en" },
          tts: { voiceId: persona.voiceId },
        },
      };
    }),
```

- [ ] **Step 4: Run test — verify pass**

Run: `npx vitest run src/features/trainer/server/router.test.ts -t startSession`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/trainer/server/router.ts src/features/trainer/server/router.test.ts
git commit -m "feat(trainer): startSession mints signed url + persona overrides"
```

---

## Task 7: scoreSession + getSessions + pickableLeads

**Files:**
- Modify: `src/features/trainer/server/router.ts`
- Modify: `src/features/trainer/server/router.test.ts`

- [ ] **Step 1: Add the failing test** (append to `router.test.ts`)

```typescript
describe("trainerRouter — sessions", () => {
  let caller: ReturnType<typeof createTestCaller>["caller"];
  let prisma: ReturnType<typeof createTestCaller>["prisma"];

  beforeEach(() => { ({ caller, prisma } = createTestCaller()); });
  afterEach(() => { vi.unstubAllEnvs(); openaiCreate.mockReset(); });

  it("scores and persists a session (no key → null scorecard)", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    prisma.lead.findUnique.mockResolvedValue({ organizationId: "org-1", company: "Acme", firstName: null, lastName: null, source: null });
    prisma.trainingPersona.findUnique.mockResolvedValue({ organizationId: "org-1", name: "Owner" });
    prisma.trainingSession.create.mockResolvedValue({ id: "s1" });

    const result = await caller.trainer.scoreSession({
      leadId: "lead-1", personaId: "p1",
      transcript: [{ role: "user", text: "Hi", at: 1 }], durationSeconds: 30,
    });

    expect(result).toEqual({ sessionId: "s1", scorecard: null });
    expect(prisma.trainingSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: "org-1", userId: "user-1", leadId: "lead-1" }) }),
    );
  });

  it("lists sessions scoped to the user for non-managers", async () => {
    ({ caller, prisma } = createTestCaller({ sessionOverrides: { role: "USER" } }));
    prisma.trainingSession.findMany.mockResolvedValue([{ id: "s1" }]);
    await caller.trainer.getSessions();
    expect(prisma.trainingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", userId: "user-1" }) }),
    );
  });

  it("returns scope-limited pickable leads (ADMIN sees all org leads)", async () => {
    prisma.lead.findMany.mockResolvedValue([{ id: "lead-1", company: "Acme" }]);
    const leads = await caller.trainer.pickableLeads();
    expect(leads).toEqual([{ id: "lead-1", company: "Acme" }]);
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/features/trainer/server/router.test.ts -t sessions`
Expected: FAIL (`scoreSession`/`getSessions`/`pickableLeads` not functions).

- [ ] **Step 3: Add the three procedures** to `trainerRouter`:

```typescript
  scoreSession: organizationProcedure
    .input(z.object({
      leadId: z.string(),
      personaId: z.string().nullable().optional(),
      transcript: z.array(z.object({
        role: z.enum(["user", "agent"]),
        text: z.string(),
        at: z.number(),
      })),
      durationSeconds: z.number().int().nonnegative().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const lead = await ctx.prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { organizationId: true, company: true, firstName: true, lastName: true, source: true },
      });
      if (!lead || lead.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
      }

      let personaName = "Prospect";
      if (input.personaId) {
        const persona = await ctx.prisma.trainingPersona.findUnique({
          where: { id: input.personaId },
          select: { organizationId: true, name: true },
        });
        if (!persona || persona.organizationId !== ctx.organizationId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found." });
        }
        personaName = persona.name;
      }

      await assertWithinRateLimit({
        key: `trainer:score:${ctx.session.user.id}`,
        limit: 20,
        windowSeconds: 60,
        message: "Too many scoring requests. Try again shortly.",
      });

      const leadName = buildLeadContext(lead).leadName;
      const scorecard = await scoreCall({ transcript: input.transcript, personaName, leadName });

      const session = await ctx.prisma.trainingSession.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.session.user.id,
          leadId: input.leadId,
          personaId: input.personaId ?? null,
          transcript: input.transcript as unknown as Prisma.InputJsonValue,
          scorecard: (scorecard ?? undefined) as Prisma.InputJsonValue | undefined,
          durationSeconds: input.durationSeconds,
        },
      });

      return { sessionId: session.id, scorecard };
    }),

  getSessions: organizationProcedure.query(({ ctx }) => {
    const where = isManagerOrAdmin(ctx.session.user.role)
      ? { organizationId: ctx.organizationId }
      : { organizationId: ctx.organizationId, userId: ctx.session.user.id };
    return ctx.prisma.trainingSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        persona: { select: { name: true } },
        lead: { select: { firstName: true, lastName: true, company: true } },
        user: { select: { name: true } },
      },
    });
  }),

  pickableLeads: organizationProcedure.query(async ({ ctx }) => {
    const scope = await getLeadScope(ctx, ctx.session.user.id, ctx.session.user.role);
    const where = leadWhereFromScope(scope);
    return ctx.prisma.lead.findMany({
      where,
      orderBy: [{ company: "asc" }, { createdAt: "desc" }],
      take: 100,
      select: { id: true, firstName: true, lastName: true, company: true, source: true },
    });
  }),
```

> Note: `assertWithinRateLimit` and `isManagerOrAdmin`/`getLeadScope`/`leadWhereFromScope`/`Prisma`/`scoreCall`/`buildLeadContext` are already imported at the top of `router.ts` from Task 5/6. If any import is missing, add it.

- [ ] **Step 4: Run test — verify pass**

Run: `npx vitest run src/features/trainer/server/router.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS. (If the `transcript`/`scorecard` Json fields error, the casts above resolve it.)

- [ ] **Step 6: Commit**

```bash
git add src/features/trainer/server/router.ts src/features/trainer/server/router.test.ts
git commit -m "feat(trainer): scoreSession, getSessions, pickableLeads"
```

---

## Task 8: Dependency + env + docs

**Files:**
- Modify: `package.json` (via npm)
- Modify: `.env.example`, `README.md`

- [ ] **Step 1: Install the SDK**

Run: `npm install @elevenlabs/client`
Expected: added to `dependencies`; no peer-dep errors.

- [ ] **Step 2: Add env vars** to `.env.example` (under an "Optional – Voice trainer" heading):

```dotenv
# Optional – Voice call trainer (ElevenLabs Conversational AI)
ELEVENLABS_API_KEY="..."
ELEVENLABS_AGENT_ID="agent_..."
```

- [ ] **Step 3: Document setup** — append a short "Voice Call Trainer" section to `README.md`:

```markdown
### Voice Call Trainer

Reps practice cold calls against an ElevenLabs-voiced AI prospect at `/trainer`.

Setup (one-time):
1. Create a Conversational AI **agent** in the ElevenLabs dashboard.
2. In the agent's **Security → Overrides**, enable overrides for *System prompt*, *First message*, *Voice*, and *Language* (overrides are ignored unless enabled).
3. Set `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` in `.env`.
4. An ADMIN creates personas at `/trainer` → "Manage Personas".

Without these env vars the page loads but starting a call returns a "not configured" error.
Scoring uses the same `DEEPSEEK_API_KEY` as other AI features; without it, sessions are saved without a scorecard.
```

- [ ] **Step 4: Verify install + type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example README.md
git commit -m "feat(trainer): add @elevenlabs/client dependency + setup docs"
```

---

## Task 9: PersonaManagerDialog (admin)

**Files:**
- Create: `src/features/trainer/components/PersonaManagerDialog.tsx`

- [ ] **Step 1: Write the component.** Uses the existing `Dialog` primitive, native `<select>` for voice, raw `<textarea>` styled like `Input`.

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ELEVENLABS_VOICES } from "../voices";
import type { PersonaInput } from "../types";
import { Trash2, Pencil, Plus } from "lucide-react";

const EMPTY: PersonaInput = {
  name: "", description: "", systemPrompt: "", firstMessage: "Hello?",
  voiceId: ELEVENLABS_VOICES[0].id, voiceName: ELEVENLABS_VOICES[0].name,
};

const textareaClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function PersonaManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: personas = [] } = trpc.trainer.listPersonas.useQuery(undefined, { enabled: open });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonaInput>(EMPTY);

  const resetForm = () => { setEditingId(null); setForm(EMPTY); };

  const create = trpc.trainer.createPersona.useMutation({
    onSuccess: () => { toast.success("Persona created"); void utils.trainer.listPersonas.invalidate(); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.trainer.updatePersona.useMutation({
    onSuccess: () => { toast.success("Persona updated"); void utils.trainer.listPersonas.invalidate(); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.trainer.deletePersona.useMutation({
    onSuccess: () => { toast.success("Persona deleted"); void utils.trainer.listPersonas.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    if (!form.name.trim() || !form.systemPrompt.trim() || !form.firstMessage.trim()) {
      toast.error("Name, first message, and system prompt are required.");
      return;
    }
    if (editingId) update.mutate({ id: editingId, ...form });
    else create.mutate(form);
  };

  const set = <K extends keyof PersonaInput>(k: K, v: PersonaInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Personas</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {personas.length === 0 && <p className="text-sm text-muted-foreground">No personas yet. Create one below.</p>}
          {personas.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.description} · {p.voiceName}</div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => { setEditingId(p.id); setForm({ name: p.name, description: p.description, systemPrompt: p.systemPrompt, firstMessage: p.firstMessage, voiceId: p.voiceId, voiceName: p.voiceName }); }}>
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => remove.mutate({ id: p.id })}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          <div className="text-sm font-medium">{editingId ? "Edit persona" : "New persona"}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Skeptical Owner" />
            </div>
            <div className="space-y-1">
              <Label>Voice</Label>
              <select
                className={textareaClass + " h-8"}
                value={form.voiceId}
                onChange={(e) => {
                  const v = ELEVENLABS_VOICES.find((x) => x.id === e.target.value)!;
                  setForm((f) => ({ ...f, voiceId: v.id, voiceName: v.name }));
                }}
              >
                {ELEVENLABS_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Defensive, busy, distrusts cold callers" />
          </div>
          <div className="space-y-1">
            <Label>First message</Label>
            <Input value={form.firstMessage} onChange={(e) => set("firstMessage", e.target.value)} placeholder="Hello?" />
          </div>
          <div className="space-y-1">
            <Label>System prompt</Label>
            <textarea
              className={textareaClass}
              rows={5}
              value={form.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              placeholder="You are {{leadName}}, owner of {{company}} in {{industry}}. You are busy and skeptical..."
            />
            <p className="text-xs text-muted-foreground">
              Placeholders: <code>{"{{leadName}}"}</code>, <code>{"{{company}}"}</code>, <code>{"{{industry}}"}</code> (industry = the lead&apos;s source).
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {editingId ? "Save changes" : <><Plus size={14} /> Create persona</>}
            </Button>
            {editingId && <Button variant="outline" onClick={resetForm}>Cancel</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS. (If `size="icon-sm"` is not a valid Button size in this repo, use `size="icon"`; if `Dialog`/`DialogContent` props differ, adjust to the signatures in `src/components/ui/dialog.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/features/trainer/components/PersonaManagerDialog.tsx
git commit -m "feat(trainer): persona management dialog (admin)"
```

---

## Task 10: TrainerCall component (ElevenLabs SDK)

**Files:**
- Create: `src/features/trainer/components/TrainerCall.tsx`

- [ ] **Step 1: Write the component.** Client-only; dynamically imports the SDK on user gesture; renders the in-call (two-panel) and scorecard states.

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { matchHint } from "../hints";
import type { Scorecard, TranscriptEntry } from "../types";
import { Mic, PhoneOff, Loader2, RotateCcw } from "lucide-react";

type Phase = "idle" | "connecting" | "active" | "scoring" | "done" | "error";
interface ActiveConversation { endSession: () => Promise<void>; }

function fmt(s: number) {
  const m = Math.floor(s / 60).toString();
  const r = (s % 60).toString().padStart(2, "0");
  return `${m}:${r}`;
}
function scoreColor(n: number) {
  return n >= 75 ? "text-green-600" : n >= 50 ? "text-amber-600" : "text-red-600";
}

export function TrainerCall({ leadId, personaId, onReset }: { leadId: string; personaId: string; onReset: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const convRef = useRef<ActiveConversation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSession = trpc.trainer.startSession.useMutation();
  const score = trpc.trainer.scoreSession.useMutation();

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const handleStart = useCallback(async () => {
    setPhase("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const cfg = await startSession.mutateAsync({ leadId, personaId });
      const { Conversation } = await import("@elevenlabs/client");
      const conv = await Conversation.startSession({
        signedUrl: cfg.signedUrl,
        overrides: cfg.overrides,
        onConnect: () => {
          setPhase("active");
          timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        },
        onDisconnect: () => stopTimer(),
        onError: (message: string) => { setPhase("error"); toast.error(message || "Voice connection error"); },
        onMessage: ({ source, message }: { source: "user" | "ai"; message: string }) => {
          const role: TranscriptEntry["role"] = source === "user" ? "user" : "agent";
          setTranscript((prev) => [...prev, { role, text: message, at: Date.now() }]);
          if (source === "ai") {
            const h = matchHint(message);
            if (h) setHints((prev) => (prev.includes(h) ? prev : [h, ...prev].slice(0, 3)));
          }
        },
      } as Parameters<typeof Conversation.startSession>[0]);
      convRef.current = conv as unknown as ActiveConversation;
    } catch (e) {
      setPhase("error");
      toast.error(e instanceof Error ? e.message : "Could not start the call");
    }
  }, [leadId, personaId, startSession]);

  const handleEnd = useCallback(async () => {
    stopTimer();
    try { await convRef.current?.endSession(); } catch { /* already closed */ }
    convRef.current = null;
    setPhase("scoring");
    try {
      const res = await score.mutateAsync({ leadId, personaId, transcript, durationSeconds: seconds });
      setScorecard(res.scorecard);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scoring failed");
    }
    setPhase("done");
  }, [leadId, personaId, transcript, seconds, score]);

  useEffect(() => () => { stopTimer(); void convRef.current?.endSession(); }, []);

  if (phase === "idle" || phase === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Mic size={26} className="text-primary" />
        </div>
        <div>
          <p className="font-medium">Ready to practice</p>
          <p className="text-sm text-muted-foreground">Your microphone will be used for this call.</p>
        </div>
        <Button onClick={handleStart} disabled={phase === "connecting"} className="bg-green-600 hover:bg-green-700">
          {phase === "connecting" ? <><Loader2 size={16} className="animate-spin" /> Connecting…</> : "Start Practice Call"}
        </Button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Scorecard</h3>
            <Button variant="outline" size="sm" onClick={onReset}><RotateCcw size={14} /> Try again</Button>
          </div>
          {scorecard ? (
            <>
              <div className="mb-4 grid grid-cols-4 gap-2 text-center">
                {([
                  ["Overall", scorecard.overallScore],
                  ["Opening", scorecard.opening.score],
                  ["Objections", scorecard.objectionHandling.score],
                  ["Close", scorecard.callToAction.score],
                ] as const).map(([label, val]) => (
                  <div key={label} className="rounded-lg border border-border bg-muted/40 p-2">
                    <div className={`text-lg font-bold ${scoreColor(val)}`}>{val}</div>
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-medium text-green-700">Highlights</p>
                <ul className="list-disc pl-5 text-muted-foreground">{scorecard.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
                <p className="font-medium text-amber-700">To improve</p>
                <ul className="list-disc pl-5 text-muted-foreground">{scorecard.improvements.map((h, i) => <li key={i}>{h}</li>)}</ul>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Scoring is unavailable (set <code>DEEPSEEK_API_KEY</code>). Your transcript is saved.</p>
          )}
        </div>
        <TranscriptPanel transcript={transcript} title="Transcript" />
      </div>
    );
  }

  // active / scoring
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-green-600">{phase === "scoring" ? "Scoring…" : "Connected"}</span>
          </div>
          <span className="text-sm text-muted-foreground">{fmt(seconds)}</span>
        </div>
        <TranscriptBody transcript={transcript} />
        <Button onClick={handleEnd} disabled={phase === "scoring"} variant="destructive" className="mt-4 w-full">
          {phase === "scoring" ? <><Loader2 size={16} className="animate-spin" /> Scoring…</> : <><PhoneOff size={16} /> End Call</>}
        </Button>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-1 font-semibold">Live Coaching</h3>
        <p className="mb-3 text-xs text-muted-foreground">Triggered by the conversation</p>
        {hints.length === 0 && <p className="text-sm text-muted-foreground">Hints will appear as the prospect speaks.</p>}
        <div className="space-y-2">
          {hints.map((h, i) => (
            <div key={h} className={i === 0 ? "rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" : "rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"}>
              {h}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TranscriptBody({ transcript }: { transcript: TranscriptEntry[] }) {
  return (
    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-sm">
      {transcript.length === 0 && <p className="text-muted-foreground">Transcript will appear here…</p>}
      {transcript.map((t, i) => (
        <p key={i}>
          <span className={t.role === "user" ? "font-medium text-blue-600" : "font-medium text-muted-foreground"}>
            {t.role === "user" ? "You: " : "Prospect: "}
          </span>
          {t.text}
        </p>
      ))}
    </div>
  );
}

function TranscriptPanel({ transcript, title }: { transcript: TranscriptEntry[]; title: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <TranscriptBody transcript={transcript} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS. (If the SDK's `startSession` option/callback types reject the shapes, the `as Parameters<...>[0]` cast on the options object already loosens them; keep callback param annotations explicit as written.)

- [ ] **Step 3: Commit**

```bash
git add src/features/trainer/components/TrainerCall.tsx
git commit -m "feat(trainer): in-call component with live transcript, hints, scorecard"
```

---

## Task 11: TrainerPanel + /trainer page

**Files:**
- Create: `src/features/trainer/components/TrainerPanel.tsx`
- Create: `src/app/trainer/page.tsx`

- [ ] **Step 1: Write `TrainerPanel.tsx`** — setup state (lead picker + persona picker), then renders `TrainerCall`.

```tsx
"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { trpc } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TrainerCall } from "./TrainerCall";
import { PersonaManagerDialog } from "./PersonaManagerDialog";
import { Settings2 } from "lucide-react";

const selectClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm h-9 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function leadLabel(l: { firstName: string | null; lastName: string | null; company: string | null }) {
  return l.company ?? [l.firstName, l.lastName].filter(Boolean).join(" ") ?? "Unnamed lead";
}

export function TrainerPanel() {
  const params = useSearchParams();
  const initialLeadId = params.get("leadId") ?? "";
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";

  const { data: leads = [] } = trpc.trainer.pickableLeads.useQuery();
  const { data: personas = [] } = trpc.trainer.listPersonas.useQuery();

  const [leadId, setLeadId] = useState(initialLeadId);
  const [personaId, setPersonaId] = useState("");
  const [started, setStarted] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Default the persona once loaded.
  const effectivePersonaId = personaId || personas[0]?.id || "";
  const canStart = useMemo(() => Boolean(leadId && effectivePersonaId), [leadId, effectivePersonaId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Call Trainer</h1>
          <p className="text-sm text-muted-foreground">Practice cold calls against an AI prospect.</p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
            <Settings2 size={14} /> Manage Personas
          </Button>
        )}
      </div>

      {!started ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="space-y-1">
              <Label>Lead</Label>
              <select className={selectClass} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">Select a lead…</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{leadLabel(l)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Persona</Label>
              {personas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No personas yet.{isAdmin ? " Create one via Manage Personas." : " Ask an admin to create one."}
                </p>
              ) : (
                <select className={selectClass} value={effectivePersonaId} onChange={(e) => setPersonaId(e.target.value)}>
                  {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
            <Button disabled={!canStart} onClick={() => setStarted(true)} className="bg-green-600 hover:bg-green-700">
              Start Practice Call
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-10 text-center">
            <p className="font-medium">Ready to practice</p>
            <p className="text-sm text-muted-foreground">Select a lead and persona, then start your session.</p>
          </div>
        </div>
      ) : (
        <TrainerCall
          leadId={leadId}
          personaId={effectivePersonaId}
          onReset={() => { setStarted(false); setPersonaId(""); }}
        />
      )}

      <PersonaManagerDialog open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  );
}
```

- [ ] **Step 2: Write the page** `src/app/trainer/page.tsx`

```tsx
"use client";

import { Suspense } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TrainerPanel } from "@/features/trainer/components/TrainerPanel";

export default function TrainerPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <TrainerPanel />
      </Suspense>
    </DashboardLayout>
  );
}
```

> `useSearchParams()` requires a `Suspense` boundary in the App Router — the wrapper above satisfies it.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/trainer/components/TrainerPanel.tsx src/app/trainer/page.tsx
git commit -m "feat(trainer): trainer panel + /trainer page"
```

---

## Task 12: Sidebar nav entry

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Import an icon.** In the `lucide-react` import block, add `Dumbbell` (or another unused icon).

- [ ] **Step 2: Add the nav item.** In `NAV_GROUPS`, inside the `"Workspace"` group's `items` array, add (e.g. after the `dialer` entry):

```typescript
      { id: "trainer", label: "Trainer", href: "/trainer", icon: Dumbbell },
```

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(trainer): add Trainer sidebar nav entry"
```

---

## Task 13: LeadModal "Practice Call" button

**Files:**
- Modify: `src/features/leads/components/lead-list/LeadModal.tsx`

- [ ] **Step 1: Ensure the icon is imported.** `Phone` is already imported (used by the Call button); reuse it, or add `Dumbbell` to the `lucide-react` import block in this file.

- [ ] **Step 2: Add the button.** In the `<div className="crm-modal-actions">` block, after the existing "Call"/"Email" links and before the "Log note" button, add:

```tsx
            <Link className="crm-btn" href={`/trainer?leadId=${lead.id}`}>
              <Dumbbell size={13} /> Practice Call
            </Link>
```

(`Link` from `next/link` is already imported in this file.)

- [ ] **Step 3: Verify**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/leads/components/lead-list/LeadModal.tsx
git commit -m "feat(trainer): add Practice Call entry from LeadModal"
```

---

## Task 14: Full verification

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no errors (warnings tolerated only if pre-existing).

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: all tests pass, including the new `src/features/trainer/**` tests.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds; `/trainer` appears in the route list. (The `@elevenlabs/client` SDK must not be evaluated during SSR — it is only imported inside the `handleStart` callback, so the build should not touch browser-only globals.)

- [ ] **Step 5: Manual smoke (optional, needs env)**

With `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID` set and an agent that has overrides enabled: `npm run dev`, open a lead → "Practice Call" → pick a persona → Start → confirm the AI speaks in-character, transcript streams, a price/objection line triggers a hint, and ending the call shows a scorecard.

- [ ] **Step 6: Final commit (if anything was adjusted during verification)**

```bash
git add -A
git commit -m "chore(trainer): verification fixes"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** personas (admin CRUD) ✓ Task 5; specific-lead context ✓ Tasks 3/6; ElevenLabs voice via signed-url + overrides ✓ Task 6; live hints ✓ Tasks 3/10; post-call scorecard ✓ Tasks 4/7/10; both hints+scorecard ✓; two-panel layout (setup/in-call/scorecard) ✓ Tasks 10/11; sidebar + LeadModal entry ✓ Tasks 12/13; sessions persisted ✓ Task 7; env + manual setup ✓ Task 8.
- **Type consistency:** `TranscriptEntry`/`Scorecard`/`PersonaInput`/`StartSessionResult` defined once in `types.ts`; `buildLeadContext`/`interpolate`/`matchHint`/`scoreCall` signatures match call sites in router + components; `onMessage` `source: "ai"` → `role: "agent"` consistent in component and `scoreSession` Zod enum.
- **Known adjustment points flagged inline:** Button `size` token, Dialog prop names, SDK option/callback types, Prisma Json casts — each step says what to do if the repo's exact signature differs.
- **Out of scope (per spec):** manager review dashboard, per-persona hint patterns, audio recording, mobile layout.
