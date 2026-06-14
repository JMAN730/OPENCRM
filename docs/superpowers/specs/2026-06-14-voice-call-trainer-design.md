# Voice Call Trainer — Design Spec

**Date:** 2026-06-14  
**Status:** Approved  

---

## Overview

A voice call trainer that lets sales reps practice cold calls against an AI prospect powered by ElevenLabs Conversational AI. The AI speaks in a realistic voice, responds dynamically using lead context, and coaches the rep with real-time hints and a post-call scorecard.

---

## Goals

- Reps practice cold calling against specific CRM leads before making the real call
- AI prospect is voiced by ElevenLabs and responds naturally based on an admin-configured persona
- Real-time coaching hints surface during the call (no extra API calls)
- A scored summary is generated after each session using the existing AI provider (DeepSeek)
- Admins can create and manage personas (name, attitude, system prompt, voice)
- Sessions are persisted so managers can review rep progress over time

---

## Architecture — Approach A (Dynamic signed-URL)

```
Rep browser
  │
  ├─ trpc.trainer.startSession(leadId, personaId)
  │     → loads lead + persona from DB
  │     → injects {{leadName}}, {{company}}, {{industry}} into system prompt
  │     → POST /v1/convai/conversations/signed-url (ElevenLabs REST API)
  │     → returns { signedUrl }
  │
  ├─ new WebSocket(signedUrl)   ← direct browser ↔ ElevenLabs connection
  │     handles: mic capture, playback, STT, LLM responses, TTS
  │     emits: transcript events (used for live hints)
  │
  └─ trpc.trainer.scoreSession(transcript, leadId, personaId, durationSeconds)
        → POST to DeepSeek with scoring prompt
        → saves TrainingSession row to DB
        → returns scorecard JSON
```

**New env var required:** `ELEVENLABS_API_KEY`

---

## Data Model

Two new Prisma models added to `prisma/schema.prisma`:

```prisma
model TrainingPersona {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  description    String
  systemPrompt   String   // template; supports {{leadName}}, {{company}}, {{industry}}
  firstMessage   String   // prospect's opening line, e.g. "Hello?"
  voiceId        String   // ElevenLabs voice ID
  voiceName      String   // human-readable label for the UI dropdown
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  sessions       TrainingSession[]

  @@index([organizationId])
}

model TrainingSession {
  id              String   @id @default(cuid())
  organizationId  String
  userId          String
  leadId          String
  personaId       String?
  transcript      Json     // [{ role: "agent"|"user", text: string, timestamp: number }]
  scorecard       Json?    // null until scored
  durationSeconds Int?
  createdAt       DateTime @default(now())

  organization    Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user            User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  lead            Lead            @relation(fields: [leadId], references: [id], onDelete: Cascade)
  persona         TrainingPersona? @relation(fields: [personaId], references: [id], onDelete: SetNull)

  @@index([organizationId, userId])
  @@index([organizationId, createdAt])
}
```

---

## tRPC Router — `trainer`

File: `src/features/trainer/server/router.ts`  
Registered as `trainer` in `src/server/api/root.ts`

### Persona procedures (admin-only)

| Procedure | Input | Notes |
|-----------|-------|-------|
| `listPersonas` | — | Org-scoped list |
| `createPersona` | `name`, `description`, `systemPrompt`, `firstMessage`, `voiceId`, `voiceName` | `assertAdmin` |
| `updatePersona` | `id`, same fields | `assertAdmin`, verifies `organizationId` |
| `deletePersona` | `id` | `assertAdmin`, verifies `organizationId` |

### Session procedures

**`startSession`** — `organizationProcedure`  
Input: `{ leadId: string, personaId: string }`  
1. Load lead — assert `lead.organizationId === ctx.organizationId`  
2. Load persona — assert `persona.organizationId === ctx.organizationId`  
3. Build system prompt by replacing `{{leadName}}`, `{{company}}`, `{{industry}}` in `persona.systemPrompt`. Null lead fields fall back to generic labels: `"the company"`, `"your industry"`.
4. `POST https://api.elevenlabs.io/v1/convai/conversations/signed-url` with assembled `agent_config` (`voiceId`, `systemPrompt`, `firstMessage`)  
5. Return `{ signedUrl: string }`  

**`scoreSession`** — `organizationProcedure`  
Input: `{ leadId, personaId, transcript: TranscriptEntry[], durationSeconds?: number }`  
1. Call DeepSeek with transcript + scoring prompt requesting JSON scorecard  
2. Scorecard shape: `{ overallScore, opening, objectionHandling, valueProposition, callToAction, highlights[], improvements[] }`  
3. Save `TrainingSession` row  
4. Return scorecard  

**`getSessions`** — `organizationProcedure`  
- ADMIN/MANAGER: all sessions for org  
- USER: own sessions only  
- Paginated, ordered by `createdAt desc`  

---

## UI

### Pages & entry points

- **`/trainer`** — standalone page, sidebar nav entry (Brain or Mic icon)
- **`LeadModal`** — "Practice Call" button in header → navigates to `/trainer?leadId={id}`

### Layout — Two-panel split (Layout A)

**Setup state** (before call):
- Left panel: Lead selector + persona list (radio-style cards) + "Start Practice Call" CTA
- Right panel: Empty state illustration + description

**In-call state** (WebSocket open):
- Left panel: Live transcript feed + "End Call" button + call timer
- Right panel: "Live Coaching" rail — active hint highlighted amber, past hints muted gray

**Post-call state** (after WebSocket closes):
- Left panel: Scorecard — overall score + 4 category scores + highlights/improvements list + "Try Again" button
- Right panel: Full transcript replay (read-only)

### Color scheme

Matches existing app theme — white cards (`bg-white`), light borders (`border-border`), dark text (`text-foreground`), muted secondary text (`text-muted-foreground`). Amber for active hints (`bg-amber-50 border-amber-200 text-amber-800`). Green for connected status (`text-green-500`). Red for "End Call" (`bg-destructive`).

### Persona management (admin only)

"Manage Personas" button at top-right of `/trainer`, hidden from non-admins. Opens a dialog with:
- List of existing personas (name + description + voice name)
- "New Persona" button → form: name, description, voiceId (dropdown), systemPrompt (textarea with `{{leadName}}`, `{{company}}`, `{{industry}}` shown as helper tokens)
- Edit / delete per persona

---

## Real-time Hints

Client-side pattern matching on `transcript` events from the ElevenLabs WebSocket. No extra API calls.

```ts
const HINT_PATTERNS = [
  { pattern: /price|cost|expensive|budget/i,     hint: "Price objection — pivot to ROI, don't defend the number" },
  { pattern: /not interested/i,                   hint: "Ask an open question to uncover the real objection" },
  { pattern: /send.*(email|info|brochure)/i,      hint: "Brush-off — give a value statement before agreeing" },
  { pattern: /not the right person|talk to/i,     hint: "Ask who handles decisions for this area" },
  { pattern: /call me back|bad time/i,            hint: "Secure a specific callback time before you hang up" },
  { pattern: /already.*(use|have|work with)/i,    hint: "Ask what they'd change about their current solution" },
]
```

Up to 3 hints displayed; newest is highlighted, older are muted. Hints fire only on prospect (agent) transcript turns.

---

## Scorecard

LLM-generated after call ends. Shape:

```ts
interface Scorecard {
  overallScore: number          // 0-100
  opening: { score: number; feedback: string }
  objectionHandling: { score: number; feedback: string }
  valueProposition: { score: number; feedback: string }
  callToAction: { score: number; feedback: string }
  highlights: string[]
  improvements: string[]
}
```

Stored in `TrainingSession.scorecard` (JSON column). Color-coded in UI: ≥75 green, 50-74 amber, <50 red.

---

## New Dependencies

- `@11labs/client` — ElevenLabs browser SDK for Conversational AI WebSocket

---

## Not in scope

- Manager dashboard for reviewing rep sessions (sessions are stored; UI view is a future iteration)
- Custom hint patterns per persona
- Recording / audio playback of sessions
- Mobile layout
