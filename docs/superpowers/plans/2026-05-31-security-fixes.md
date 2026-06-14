# Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 confirmed security vulnerabilities identified by the pentest-specialist agent, ranging from HIGH (toll fraud, unauthenticated cron, cross-org IDOR) to LOW (CSV formula injection).

**Architecture:** Each fix is surgical — touching only the affected procedure or route handler. TDD: write a failing test that proves the vulnerability, then apply the minimal code change. No refactoring of surrounding logic.

**Tech Stack:** Next.js App Router route handlers, tRPC `organizationProcedure`, Prisma, Twilio Node SDK (`twilio.validateRequest`), Vitest + React Testing Library.

---

## Findings Reference

| # | Severity | Location | Vulnerability |
|---|----------|----------|---------------|
| 1 | HIGH | `src/app/api/twilio/voice/route.ts` | No Twilio webhook signature validation — toll fraud |
| 2 | HIGH | `src/app/api/cron/scraper/route.ts` | Fails open when `CRON_SECRET` env var is unset |
| 3 | HIGH | `src/features/tasks/server/router.ts` | `tasks.update` lets caller set `leadId`/`assignedToId` to any cross-org value |
| 4 | MEDIUM | `src/features/teams/server/router.ts` | `teams.promoteRole` — MANAGER can demote an ADMIN |
| 5 | MEDIUM | `src/features/pipeline/server/router.ts` | `moveLead` / `updateDealValue` — missing lead-scope check, USER can edit any org lead |
| 6 | MEDIUM | `src/features/scoring/server/router.ts` | `upsertRule` / `deleteRule` / `resetToDefaults` — not admin/manager-gated |
| 7 | LOW | `src/features/auth/server/router.ts` | `auth.updateProfile` — email change without password verification |
| 8 | LOW | `src/features/leads/server/router.ts` | `leads.export` — CSV formula injection (`=`, `+`, `-`, `@` not escaped) |

---

## File Map

| File | What changes |
|------|-------------|
| `src/app/api/twilio/voice/route.ts` | Add `twilio.validateRequest` guard when `TWILIO_AUTH_TOKEN` is set |
| `src/app/api/cron/scraper/route.ts` | Block (503) when `CRON_SECRET` is unset; add to `.env.example` |
| `.env.example` | Add `CRON_SECRET` and `TWILIO_AUTH_TOKEN` documentation |
| `src/features/tasks/server/router.ts` | Validate `leadId` org ownership and `assignedToId` org membership before write |
| `src/features/tasks/server/router.test.ts` | Tests for cross-org IDOR in `update` |
| `src/features/teams/server/router.ts` | Fetch target's current role; block MANAGER from touching ADMIN |
| `src/features/teams/server/router.test.ts` | Test MANAGER-demotes-ADMIN is rejected |
| `src/features/pipeline/server/router.ts` | Apply `getLeadScope` / `leadWhereFromScope` in `moveLead` and `updateDealValue` |
| `src/features/pipeline/server/router.test.ts` | Tests for USER scope enforcement |
| `src/features/scoring/server/router.ts` | Add `assertManagerOrAdmin` to `upsertRule`, `deleteRule`, `resetToDefaults` |
| `src/features/scoring/server/router.test.ts` | Tests that USER is rejected |
| `src/features/auth/server/router.ts` | Require `currentPassword` when changing email in `updateProfile` |
| `src/features/auth/server/router.test.ts` | Test password gating on email change |
| `src/features/leads/server/router.ts` | Escape leading formula chars in `esc()` helper |
| `src/features/leads/server/router.test.ts` | Test formula injection escape |

---

## Task 1: Twilio voice webhook — add signature validation

**Files:**
- Modify: `src/app/api/twilio/voice/route.ts`
- Modify: `.env.example`

**Context:** The `/api/twilio/voice` endpoint accepts a public POST and dials whatever number the caller provides. With no Twilio signature check, any attacker can POST directly and generate fraudulent calls (toll fraud). The fix uses `twilio.validateRequest(authToken, twilioSig, url, params)`. We skip validation if `TWILIO_AUTH_TOKEN` is not configured (non-Twilio deployments), consistent with the existing opt-in Twilio pattern.

- [ ] **Step 1: Read the current file**

Run: `cat src/app/api/twilio/voice/route.ts`

- [ ] **Step 2: Write the updated route with signature validation**

Replace the full content of `src/app/api/twilio/voice/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

// Public endpoint — Twilio posts here when a browser Device places an outbound call.
// When TWILIO_AUTH_TOKEN is configured, every request must carry a valid X-Twilio-Signature
// to prevent toll fraud from unauthenticated callers.
export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  const body = await request.formData();
  const params: Record<string, string> = {};
  body.forEach((value, key) => {
    params[key] = String(value);
  });

  if (authToken) {
    const twilioSig = request.headers.get("x-twilio-signature") ?? "";
    // NEXTAUTH_URL is the canonical base URL; fall back to reconstructing from the request.
    const baseUrl =
      process.env.NEXTAUTH_URL ??
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const url = `${baseUrl}/api/twilio/voice`;

    const valid = twilio.validateRequest(authToken, twilioSig, url, params);
    if (!valid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const to = params["To"] ?? null;
  const callerIdNumber = process.env.TWILIO_PHONE_NUMBER;

  const twiml = new twilio.twiml.VoiceResponse();

  if (to && callerIdNumber) {
    const dial = twiml.dial({ callerId: callerIdNumber });
    dial.number(to);
  } else {
    twiml.say("This call could not be connected.");
  }

  return new NextResponse(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
```

- [ ] **Step 3: Update `.env.example` to document the new env var**

In the Twilio section of `.env.example`, add after the existing Twilio vars:

```
# TWILIO_AUTH_TOKEN="your-account-auth-token"   # Required for webhook signature validation
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no errors in `src/app/api/twilio/voice/route.ts`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/twilio/voice/route.ts .env.example
git commit -m "fix: validate Twilio webhook signature to prevent toll fraud"
```

---

## Task 2: Cron scraper — require `CRON_SECRET` always

**Files:**
- Modify: `src/app/api/cron/scraper/route.ts`
- Modify: `.env.example`

**Context:** Currently the auth check is inside `if (CRON_SECRET)` — if the env var is absent the check is skipped entirely and anyone can trigger scrapes for all orgs. The fix: return 503 when `CRON_SECRET` is unset (endpoint disabled until configured), and 401 when the bearer token is wrong.

- [ ] **Step 1: Write the updated route**

Replace the full content of `src/app/api/cron/scraper/route.ts` with:

```typescript
import { NextResponse } from "next/server";
import { runDueSchedules } from "@/server/scraper/scheduler";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request): Promise<Response> {
  if (!CRON_SECRET) {
    // Fail closed: if the secret is not configured, refuse all requests.
    // Set CRON_SECRET in your environment to enable this endpoint.
    return NextResponse.json(
      { error: "Cron endpoint is disabled: CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDueSchedules();
  return NextResponse.json({ ok: true, ...result });
}
```

- [ ] **Step 2: Add `CRON_SECRET` to `.env.example`**

Add a new section after the Redis section:

```
# Optional – Cron endpoint authentication (required to use /api/cron/scraper)
# CRON_SECRET="generate-with: openssl rand -hex 32"
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/scraper/route.ts .env.example
git commit -m "fix: require CRON_SECRET to be set; return 503 when absent instead of failing open"
```

---

## Task 3: `tasks.update` — validate `leadId` and `assignedToId` org ownership

**Files:**
- Modify: `src/features/tasks/server/router.ts`
- Modify: `src/features/tasks/server/router.test.ts`

**Context:** The `update` procedure writes `leadId` and `assignedToId` directly from user input without checking they belong to `ctx.organizationId`. After the write, `getById` includes the lead via Prisma — exposing cross-org lead data (firstName, lastName, company). The `create` procedure already validates `leadId` org ownership; replicate that pattern in `update`.

- [ ] **Step 1: Write failing tests**

Open `src/features/tasks/server/router.test.ts`. Find the `describe("update", ...)` block and add two tests after the last existing `update` test:

```typescript
it("rejects when leadId points at a lead in another org", async () => {
  prisma.task.findFirst.mockResolvedValue({
    id: "t1",
    userId: "user-1",
    leadId: null,
    title: "t",
  });
  prisma.lead.findUnique.mockResolvedValue({ organizationId: "other-org" });

  await expect(
    caller.tasks.update({ taskId: "t1", leadId: "lead-other-org" })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });

  expect(prisma.task.update).not.toHaveBeenCalled();
});

it("rejects when assignedToId points at a user in another org", async () => {
  prisma.task.findFirst.mockResolvedValue({
    id: "t1",
    userId: "user-1",
    leadId: null,
    title: "t",
  });
  prisma.user.findFirst.mockResolvedValue(null); // user not in org

  await expect(
    caller.tasks.update({ taskId: "t1", assignedToId: "user-other-org" })
  ).rejects.toMatchObject({ code: "NOT_FOUND" });

  expect(prisma.task.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest src/features/tasks/server/router.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: the two new tests FAIL

- [ ] **Step 3: Apply the fix**

Open `src/features/tasks/server/router.ts`. Find the `update` mutation. Add validation for `leadId` and `assignedToId` after the existing ownership/role check and before `prisma.task.update`. Insert these two blocks:

```typescript
// Validate leadId belongs to this org (same guard as tasks.create)
if (input.leadId != null) {
  const lead = await ctx.prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { organizationId: true },
  });
  if (!lead || lead.organizationId !== ctx.organizationId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
  }
}

// Validate assignedToId belongs to this org
if (input.assignedToId != null) {
  const assignee = await ctx.prisma.user.findFirst({
    where: { id: input.assignedToId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!assignee) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Assigned user not found." });
  }
}
```

These go right before the `const status = ...` line.

- [ ] **Step 4: Run tests**

Run: `npx vitest src/features/tasks/server/router.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tasks/server/router.ts src/features/tasks/server/router.test.ts
git commit -m "fix: validate leadId and assignedToId org ownership in tasks.update (IDOR)"
```

---

## Task 4: `teams.promoteRole` — prevent MANAGER from demoting ADMIN

**Files:**
- Modify: `src/features/teams/server/router.ts`
- Modify: `src/features/teams/server/router.test.ts`

**Context:** `assertCanGrantRole(callerRole, targetRole)` checks whether the caller can assign a role, but not whether they outrank the target user's **current** role. A MANAGER calling `promoteRole({ userId: <admin>, role: 'USER' })` passes the existing check but should be blocked.

Fix: after fetching the target user, compare `ROLE_VALUES` indices. `ROLE_VALUES = ["ADMIN", "MANAGER", "USER"]` — lower index = higher privilege (ADMIN=0, MANAGER=1, USER=2). Throw FORBIDDEN if `callerIdx > targetIdx` (caller is lower-privilege than target).

- [ ] **Step 1: Write failing tests**

Open `src/features/teams/server/router.test.ts`. Add a new `describe("promoteRole")` block:

```typescript
describe("promoteRole", () => {
  it("blocks MANAGER from demoting an ADMIN to USER", async () => {
    const { caller, prisma } = createTestCaller({
      sessionOverrides: { role: "MANAGER" },
    });
    prisma.user.findFirst.mockResolvedValue({ id: "admin-user", role: "ADMIN" });

    await expect(
      caller.teams.promoteRole({ userId: "admin-user", role: "USER" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("allows ADMIN to demote another ADMIN", async () => {
    const { caller, prisma } = createTestCaller({
      sessionOverrides: { role: "ADMIN" },
    });
    prisma.user.findFirst.mockResolvedValue({ id: "other-admin", role: "ADMIN" });
    prisma.user.update.mockResolvedValue({ id: "other-admin", role: "USER" });

    await caller.teams.promoteRole({ userId: "other-admin", role: "USER" });
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it("allows MANAGER to demote a USER (no rank violation)", async () => {
    const { caller, prisma } = createTestCaller({
      sessionOverrides: { role: "MANAGER" },
    });
    prisma.user.findFirst.mockResolvedValue({ id: "some-user", role: "USER" });
    prisma.user.update.mockResolvedValue({ id: "some-user", role: "USER" });

    await caller.teams.promoteRole({ userId: "some-user", role: "USER" });
    expect(prisma.user.update).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm first test fails**

Run: `npx vitest src/features/teams/server/router.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: "blocks MANAGER from demoting an ADMIN to USER" FAILS

- [ ] **Step 3: Apply the fix**

Open `src/features/teams/server/router.ts`. In the `promoteRole` mutation:

1. Change `select: { id: true }` to `select: { id: true, role: true }`.
2. After the `if (!target) throw NOT_FOUND` line, add:

```typescript
// Caller must outrank (or equal) the target's current role to modify them.
// ROLE_VALUES: ADMIN=0 (highest), MANAGER=1, USER=2 (lowest).
const callerIdx = ROLE_VALUES.indexOf(ctx.session.user.role as typeof ROLE_VALUES[number]);
const targetIdx = ROLE_VALUES.indexOf(target.role as typeof ROLE_VALUES[number]);
if (callerIdx > targetIdx) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Cannot modify a user of higher rank.",
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest src/features/teams/server/router.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/teams/server/router.ts src/features/teams/server/router.test.ts
git commit -m "fix: prevent MANAGER from demoting users of equal or higher rank (promoteRole)"
```

---

## Task 5: `pipeline.moveLead` / `updateDealValue` — enforce lead scope

**Files:**
- Modify: `src/features/pipeline/server/router.ts`
- Modify: `src/features/pipeline/server/router.test.ts`

**Context:** `moveLead` and `updateDealValue` filter by `organizationId` but not by `getLeadScope`. A USER assigned only to their own leads can still move/edit any org lead. The `createDeal` procedure already uses `getLeadScope` — replicate that pattern.

- [ ] **Step 1: Write failing tests**

Open `src/features/pipeline/server/router.test.ts`. Add two describe blocks at the bottom:

```typescript
describe("pipelineRouter.moveLead", () => {
  it("allows ADMIN to move any lead", async () => {
    const { caller, prisma } = createTestCaller({ sessionOverrides: { role: "ADMIN" } });
    prisma.pipelineStage.findFirst.mockResolvedValue({
      id: "stage-1",
      pipeline: { organizationId: "org-1" },
    });
    prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
    prisma.lead.update.mockResolvedValue({ id: "lead-1" });

    await caller.pipeline.moveLead({ leadId: "lead-1", stageId: "stage-1" });
    expect(prisma.lead.update).toHaveBeenCalled();
  });

  it("blocks USER from moving a lead not in their scope", async () => {
    const { caller, prisma } = createTestCaller({ sessionOverrides: { role: "USER" } });
    prisma.pipelineStage.findFirst.mockResolvedValue({
      id: "stage-1",
      pipeline: { organizationId: "org-1" },
    });
    prisma.lead.findFirst.mockResolvedValue(null); // not in scope

    await expect(
      caller.pipeline.moveLead({ leadId: "unowned-lead", stageId: "stage-1" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});

describe("pipelineRouter.updateDealValue", () => {
  it("blocks USER from updating a lead not in their scope", async () => {
    const { caller, prisma } = createTestCaller({ sessionOverrides: { role: "USER" } });
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(
      caller.pipeline.updateDealValue({ leadId: "unowned-lead", value: 5000 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(prisma.lead.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest src/features/pipeline/server/router.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: the scope-blocking tests FAIL

- [ ] **Step 3: Apply the fix to `moveLead`**

In `src/features/pipeline/server/router.ts`, replace the `moveLead` mutation body:

```typescript
moveLead: organizationProcedure
  .input(z.object({ leadId: z.string(), stageId: z.string().nullable() }))
  .mutation(async ({ ctx, input }) => {
    if (input.stageId) {
      const stage = await ctx.prisma.pipelineStage.findFirst({
        where: { id: input.stageId },
        include: { pipeline: true },
      });
      if (!stage || stage.pipeline.organizationId !== ctx.organizationId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Stage not found' });
      }
    }

    const scope = await getLeadScope(ctx, ctx.session.user.id, ctx.session.user.role);
    const lead = await ctx.prisma.lead.findFirst({
      where: { id: input.leadId, ...leadWhereFromScope(scope) },
      select: { id: true },
    });
    if (!lead) throw new TRPCError({ code: 'FORBIDDEN', message: 'Lead not found' });

    return ctx.prisma.lead.update({
      where: { id: lead.id },
      data: { pipelineStageId: input.stageId },
    });
  }),
```

- [ ] **Step 4: Apply the fix to `updateDealValue`**

Replace the `updateDealValue` mutation body:

```typescript
updateDealValue: organizationProcedure
  .input(z.object({ leadId: z.string(), value: z.number().nonnegative().max(99999).nullable() }))
  .mutation(async ({ ctx, input }) => {
    const scope = await getLeadScope(ctx, ctx.session.user.id, ctx.session.user.role);
    const lead = await ctx.prisma.lead.findFirst({
      where: { id: input.leadId, ...leadWhereFromScope(scope) },
      select: { id: true },
    });
    if (!lead) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });
    return ctx.prisma.lead.update({
      where: { id: lead.id },
      data: { value: input.value },
      select: LEAD_SELECT,
    });
  }),
```

- [ ] **Step 5: Run tests**

Run: `npx vitest src/features/pipeline/server/router.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/pipeline/server/router.ts src/features/pipeline/server/router.test.ts
git commit -m "fix: apply lead scope check to pipeline.moveLead and updateDealValue"
```

---

## Task 6: Scoring mutations — require MANAGER or ADMIN

**Files:**
- Modify: `src/features/scoring/server/router.ts`
- Modify: `src/features/scoring/server/router.test.ts`

**Context:** `upsertRule`, `deleteRule`, and `resetToDefaults` accept any authenticated org member. Scoring rules govern how leads are ranked org-wide; only managers/admins should modify them. `assertManagerOrAdmin` is already in `src/server/authz.ts`.

- [ ] **Step 1: Write failing tests**

Open `src/features/scoring/server/router.test.ts`. Add a `describe("role gating")` block. Note the `RULE_STUB` is already defined at the top of the file:

```typescript
describe("role gating", () => {
  it("blocks USER from calling upsertRule", async () => {
    const { caller } = createTestCaller({ sessionOverrides: { role: "USER" } });

    await expect(
      caller.scoring.upsertRule({
        factor: "star_rating",
        label: "Star Rating",
        maxPoints: 40,
        weight: 1.0,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks USER from calling deleteRule", async () => {
    const { caller } = createTestCaller({ sessionOverrides: { role: "USER" } });

    await expect(
      caller.scoring.deleteRule({ id: "rule-1" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks USER from calling resetToDefaults", async () => {
    const { caller } = createTestCaller({ sessionOverrides: { role: "USER" } });

    await expect(caller.scoring.resetToDefaults()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows MANAGER to call upsertRule", async () => {
    const { caller, prisma } = createTestCaller({ sessionOverrides: { role: "MANAGER" } });
    prisma.scoringRule.findFirst.mockResolvedValue(null);
    prisma.scoringRule.create.mockResolvedValue({ ...RULE_STUB });

    await caller.scoring.upsertRule({
      factor: "star_rating",
      label: "Star Rating",
      maxPoints: 40,
      weight: 1.0,
    });

    expect(prisma.scoringRule.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest src/features/scoring/server/router.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: the three "blocks USER" tests FAIL

- [ ] **Step 3: Add the import and guards**

Open `src/features/scoring/server/router.ts`. Check the existing imports; add `assertManagerOrAdmin` if not already imported:

```typescript
import { assertManagerOrAdmin } from "@/server/authz";
```

Then add `assertManagerOrAdmin(ctx.session.user.role);` as the **first line** of the mutation handler for each of `upsertRule`, `deleteRule`, and `resetToDefaults`.

- [ ] **Step 4: Run tests**

Run: `npx vitest src/features/scoring/server/router.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/scoring/server/router.ts src/features/scoring/server/router.test.ts
git commit -m "fix: gate scoring mutations (upsertRule, deleteRule, resetToDefaults) to MANAGER/ADMIN"
```

---

## Task 7: `auth.updateProfile` — require current password when changing email

**Files:**
- Modify: `src/features/auth/server/router.ts`
- Modify: `src/features/auth/server/router.test.ts`

**Context:** An attacker with temporary session access can change the victim's email to attacker-controlled, then request a password reset → full account takeover. Fix: when `email` is in the update payload, require `currentPassword` and verify it via bcrypt before committing the change. `bcryptjs` is already imported in this file.

- [ ] **Step 1: Write failing tests**

Open `src/features/auth/server/router.test.ts`. Find the `describe("updateProfile", ...)` block and add:

```typescript
it("rejects email change when currentPassword is missing", async () => {
  await expect(
    caller.auth.updateProfile({ email: "new@example.com" })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

it("rejects email change when currentPassword is wrong", async () => {
  const bcrypt = await import("bcryptjs");
  prisma.user.findUnique.mockResolvedValue({
    id: "user-1",
    password: await bcrypt.hash("correct-password", 10),
  });

  await expect(
    caller.auth.updateProfile({
      email: "new@example.com",
      currentPassword: "wrong-password",
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(prisma.user.update).not.toHaveBeenCalled();
});

it("allows email change when currentPassword matches", async () => {
  const bcrypt = await import("bcryptjs");
  prisma.user.findUnique.mockResolvedValue({
    id: "user-1",
    password: await bcrypt.hash("correct-password", 10),
  });
  prisma.user.findFirst.mockResolvedValue(null); // no email conflict
  prisma.user.update.mockResolvedValue({});

  await caller.auth.updateProfile({
    email: "new@example.com",
    currentPassword: "correct-password",
  });

  expect(prisma.user.update).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest src/features/auth/server/router.test.ts --reporter=verbose 2>&1 | grep -E "PASS|FAIL|rejects email|allows email" | head -20`
Expected: the two "rejects email" tests FAIL

- [ ] **Step 3: Apply the fix**

Open `src/features/auth/server/router.ts`. Find the `updateProfile` mutation.

**3a.** Update the Zod input to accept `currentPassword` and validate its presence when email is changing:

```typescript
.input(
  z.object({
    name: z.string().min(1).max(255).optional(),
    email: z.string().email().max(255).optional(),
    currentPassword: z.string().optional(),
    loadingAnimationMode: loadingAnimationModeSchema.optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.email !== undefined ||
      d.loadingAnimationMode !== undefined,
    { message: "At least one field must be provided" }
  )
  .superRefine((d, ctx) => {
    if (d.email !== undefined && !d.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current password is required to change your email.",
        path: ["currentPassword"],
      });
    }
  })
)
```

**3b.** At the start of the mutation handler, before the `if (input.email)` block, add the bcrypt check:

```typescript
if (input.email) {
  const user = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });
  if (!user?.password || !input.currentPassword) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot verify identity — password required.",
    });
  }
  const passwordMatches = await bcrypt.compare(input.currentPassword, user.password);
  if (!passwordMatches) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Current password is incorrect." });
  }

  const email = input.email.toLowerCase().trim();
  const existing = await ctx.prisma.user.findFirst({
    where: { email, NOT: { id: userId } },
  });
  if (existing) {
    throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists." });
  }
  input.email = email;
}
```

This replaces the existing `if (input.email)` block entirely (which currently only checks for uniqueness).

- [ ] **Step 4: Run tests**

Run: `npx vitest src/features/auth/server/router.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: all tests PASS

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/features/auth/server/router.ts src/features/auth/server/router.test.ts
git commit -m "fix: require current password when changing email in auth.updateProfile"
```

---

## Task 8: `leads.export` — escape CSV formula injection

**Files:**
- Modify: `src/features/leads/server/router.ts`
- Modify: `src/features/leads/server/router.test.ts`

**Context:** The `esc()` helper inside `leads.export` wraps values containing commas/quotes/newlines but does NOT escape leading `=`, `+`, `-`, `@` — these become live spreadsheet formulas in Excel/LibreOffice. OWASP fix: prefix formula-starting values with a tab character inside the quotes so they are treated as literals.

- [ ] **Step 1: Write failing test**

Open `src/features/leads/server/router.test.ts`. Locate the `describe("export", ...)` block (or add one) and add:

```typescript
it("escapes leading formula characters to prevent CSV injection", async () => {
  prisma.lead.findMany.mockResolvedValue([
    {
      id: "lead-1",
      firstName: "=DANGEROUS()",
      lastName: "+also-bad",
      company: "-minus",
      email: "@at-risk",
      phone: "normal",
      city: null,
      state: null,
      status: "NOT_CONTACTED",
      callOutcome: "NOT_CONTACTED",
      rating: null,
      reviewCount: null,
      source: null,
      website: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      assignedTo: null,
    },
  ]);

  const result = await caller.leads.export({});
  const dataRow = result.csv.split("\n")[1];

  expect(dataRow).toContain('"\t=DANGEROUS()"');
  expect(dataRow).toContain('"\t+also-bad"');
  expect(dataRow).toContain('"\t-minus"');
  expect(dataRow).toContain('"\t@at-risk"');
  // Plain phone number should NOT be quoted
  expect(dataRow).toContain(",normal,");
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx vitest src/features/leads/server/router.test.ts -t "formula" --reporter=verbose 2>&1 | tail -20`
Expected: FAIL

- [ ] **Step 3: Update the `esc()` helper**

Open `src/features/leads/server/router.ts`. Find the `esc` function inside the `export` mutation (around line 1139). Replace it:

```typescript
const FORMULA_PREFIXES = new Set(["=", "+", "-", "@"]);

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  const isFormula = s.length > 0 && FORMULA_PREFIXES.has(s[0]);
  const needsQuote =
    isFormula || s.includes(",") || s.includes('"') || s.includes("\n");
  if (!needsQuote) return s;
  // Prefix formula-starting values with a tab so spreadsheet apps treat them as literals.
  const safe = isFormula ? `\t${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
```

- [ ] **Step 4: Run test**

Run: `npx vitest src/features/leads/server/router.test.ts -t "formula" --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Run all leads router tests**

Run: `npx vitest src/features/leads/server/router.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/features/leads/server/router.ts src/features/leads/server/router.test.ts
git commit -m "fix: escape leading formula characters in leads.export CSV (injection prevention)"
```

---

## Final Verification

- [ ] **Run the full test suite**

Run: `npm test 2>&1 | tail -30`
Expected: all tests pass, no regressions

- [ ] **Type-check**

Run: `npm run type-check`
Expected: no errors

- [ ] **Lint**

Run: `npm run lint`
Expected: no errors

---

## Self-Review: Spec Coverage

| Finding | Task | Status |
|---------|------|--------|
| Twilio toll fraud | Task 1 | ✓ covered |
| Cron fails-open | Task 2 | ✓ covered |
| `tasks.update` IDOR | Task 3 | ✓ covered |
| `promoteRole` MANAGER demotes ADMIN | Task 4 | ✓ covered |
| `moveLead`/`updateDealValue` scope | Task 5 | ✓ covered |
| Scoring mutations not gated | Task 6 | ✓ covered |
| Email change without password | Task 7 | ✓ covered |
| CSV formula injection | Task 8 | ✓ covered |
