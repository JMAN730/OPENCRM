# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Heads-up from `AGENTS.md`:** this Next.js version has breaking changes from public docs. Before writing Next.js code, consult the in-tree docs at `node_modules/next/dist/docs/` and heed deprecation notices.

Sibling docs at the repo root (`AGENTS.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `README.md`) may carry additional conventions not duplicated here.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run start        # Run production server (after build)
npm run lint         # ESLint
npm run type-check   # TypeScript type check (tsc --noEmit)
npm run seed         # Seed the database (npx prisma db seed)

npm test             # Run all tests once (vitest run)
npm run test:watch   # Run tests in watch mode
npm run test:coverage  # Run tests with coverage
npm run test:e2e     # Playwright browser-flow tests
npx vitest src/features/leads/components/LeadsList.test.tsx  # Run a single test file

npm run tauri:dev    # Tauri desktop wrapper (WIP — see convention #9)
npm run tauri:build  # Build Tauri desktop app

npx prisma db push   # Sync schema to database (no migrations generated)
npx prisma studio    # Open Prisma Studio GUI

docker compose up --build   # Start full stack (Next.js + PostgreSQL) on http://localhost:3000
```

## Environment

Create a `.env` file (see `.env.example` for reference):

```dotenv
# Required (PostgreSQL is the canonical DB; the schema uses provider = "postgresql")
DATABASE_URL="postgresql://crm:crm@localhost:5432/crm"
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"

# Required when running via docker compose (used by the postgres service)
POSTGRES_USER="crm"
POSTGRES_PASSWORD="crm"
POSTGRES_DB="crm"

# Optional – OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Optional – Caching, rate limiting, and auth-snapshot cache invalidation
REDIS_URL="redis://localhost:6379"

# Optional – Email (SMTP for password reset)
SMTP_HOST="..."
SMTP_PORT="587"
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM="noreply@example.com"

# Optional – Scraper (paths to Python binary and scraper script)
SCRAPER_PYTHON_PATH="python3"
SCRAPER_SCRIPT_PATH="scraper/scraper.py"

# Optional – Lead map (/map): override public OSM endpoints (self-hosted mirrors)
OVERPASS_URL="https://overpass-api.de/api/interpreter"
NOMINATIM_URL="https://nominatim.openstreetmap.org/search"

# Optional – Trusted proxy (for X-Forwarded-For IP extraction)
TRUSTED_PROXY="true"

# Optional – Public base URL (used to build email tracking / unsubscribe links)
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Optional – Outreach email via Resend (CAN-SPAM outreach + delivery webhooks)
RESEND_API_KEY="..."
RESEND_FROM_EMAIL="noreply@example.com"
RESEND_WEBHOOK_SECRET="..."          # svix signing secret for /api/webhooks/resend
SENDER_NAME="Your Company"
SENDER_PHYSICAL_ADDRESS="123 Main St, City, ST 00000"  # required for CAN-SPAM compliance

# Optional – Cron auth (shared secret for /api/cron/* endpoints)
CRON_SECRET="..."
OUTREACH_BATCH_SIZE="5"                # max leads processed per /api/cron/outreach tick

# Optional – Stripe billing (subscriptions + Settings → Billing tab)
STRIPE_SECRET_KEY="..."
STRIPE_WEBHOOK_SECRET="..."          # svix signing secret for /api/webhooks/stripe
STRIPE_PRICE_STARTER="price_..."
STRIPE_PRICE_PRO="price_..."
STRIPE_PRICE_BUSINESS="price_..."

# Optional – Voice call trainer (ElevenLabs Conversational AI)
ELEVENLABS_API_KEY="..."
ELEVENLABS_AGENT_ID="agent_..."

# Optional – Demo site photos (Google Places → Pexels fallback)
GOOGLE_PLACES_API_KEY="..."
PEXELS_API_KEY="..."

# Optional – Twilio (browser dialer)
TWILIO_ACCOUNT_SID="..."
TWILIO_AUTH_TOKEN="..."
TWILIO_API_KEY="..."
TWILIO_API_SECRET="..."
TWILIO_TWIML_APP_SID="..."
TWILIO_PHONE_NUMBER="+15555555555"

# Optional – AI provider (lead qualification + email copy; OpenAI-compatible)
DEEPSEEK_API_KEY="..."
DEEPSEEK_BASE_URL="https://api.deepseek.com"
AI_MODEL="deepseek-chat"

# Optional – Stripe billing (subscriptions, plan enforcement)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."    # signing secret for /api/webhooks/stripe
STRIPE_PRICE_STARTER="price_..."
STRIPE_PRICE_PRO="price_..."
STRIPE_PRICE_BUSINESS="price_..."
```

## Architecture

### Request flow

Client component → `trpc.<router>.<procedure>` (from `src/app/_trpc/client.ts`) → HTTP POST `/api/trpc` → tRPC handler (`src/app/api/trpc/[trpc]/route.ts`) → procedure in `src/features/<feature>/server/router.ts` → Prisma → Database.

### tRPC setup

- **Context** (`src/server/trpc.ts`): attaches `prisma` client, `session`, and `organizationId` to every request. Also revalidates deleted-user sessions on every call.
- **Procedures**:
  - `publicProcedure` — unauthenticated (auth endpoints only)
  - `protectedProcedure` — throws `UNAUTHORIZED` if no valid session
  - `organizationProcedure` — extends `protectedProcedure`; additionally throws `UNAUTHORIZED` if `organizationId` is missing from the session. On **mutations** (except `billing.*`), auto-provisions a 14-day STARTER trial if needed and enforces an active subscription via `assertSubscriptionActiveForOrg`.
- **Root router** (`src/server/api/root.ts`): merges all feature routers.
- **Client** (`src/app/_trpc/client.ts`): typed `trpc` hook object, imported in any client component.
- **Provider** (`src/app/_trpc/Provider.tsx` + `src/components/Providers.tsx`): wraps the app in `SessionProvider` → `TRPCProvider` → `QueryClientProvider`.
- **Error formatting**: Zod validation errors are flattened into `fieldErrors` in the tRPC error response.

### Root router — registered namespaces

```typescript
// src/server/api/root.ts
appRouter = {
  leads:            leadsRouter,            // full CRUD + bulk import + cursor pagination + notes + custom outcomes
  calls:            callsRouter,            // call logging + retrieval + Twilio token
  scraper:          scraperRouter,          // Google Maps lead scraper
  scraperSchedules: scheduledScraperRouter, // recurring scraper schedules (cron-driven)
  tasks:            tasksRouter,            // task CRUD + filtering + calendar
  dashboard:        dashboardRouter,        // KPI aggregations (Redis-cached) + team stats + my stats
  auth:             authRouter,             // register, password reset, profile, deleteAccount
  teams:            teamsRouter,            // team CRUD + memberships + email-token invitations
  scoring:          scoringRouter,          // lead-scoring rule CRUD
  scripts:          scriptsRouter,          // sales-script CRUD
  websites:         websitesRouter,         // template-based + AI per-lead site generator
  emails:           emailsRouter,           // CAN-SPAM outreach email drafts + send (Resend) + tracking
  pipeline:         pipelineRouter,         // deal pipeline board (stages + lead placement)
  analytics:        analyticsRouter,        // analytics aggregations for /analytics
  outreach:         outreachRouter,         // automated outreach queue (cron worker + review/bulk-send)
  map:              mapRouter,              // lead map (OSM viewport queries, discovery, enrichment)
  trainer:          trainerRouter,          // voice call trainer (ElevenLabs personas + session scoring)
  billing:          billingRouter,          // Stripe subscriptions (checkout, portal, plan limits)
  platform:         platformRouter,         // super-admin cross-org monitoring (read-only, NOT org-scoped)
}
```

### Adding a new feature router

1. Create `src/features/<feature>/server/router.ts` exporting a `createTRPCRouter({...})`.
2. Register it in `src/server/api/root.ts`.
3. Use `trpc.<feature>.<procedure>.useQuery/useMutation()` in client components.
4. Use `organizationProcedure` (not bare `protectedProcedure`) for all org-scoped operations.

### Authentication

`src/lib/auth.ts` — NextAuth with JWT sessions. Session types are augmented in `src/types/next-auth.d.ts`; `session.user` includes `id`, `role`, `organizationId`, and `teamId` via the `jwt`/`session` callbacks.

- **Registration** (`trpc.auth.register`): creates a new `Organization` and `User` (ADMIN role) with a bcrypt-hashed password. Validated via Zod (min 8-char password, valid email, non-empty name). The legacy `POST /api/auth/register` endpoint has been removed.
- **Password reset** (`trpc.auth.resetPassword` / `trpc.auth.confirmResetPassword`): issues a hashed `PasswordResetToken` (1-hour expiry) and sends an email via `lib/email.ts`. Falls back to logging the reset URL to console when SMTP is not configured.
- **Credentials provider**: validates email + bcrypt password.
- **Google OAuth**: enabled when `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set. First-time Google sign-in auto-provisions an `Organization` (14-day STARTER trial) + ADMIN `User` via `provisionUserWithOrganization` (`src/features/auth/server/provision.ts`, shared with `auth.register`); requires Google's `email_verified`, matched to existing accounts by email, rate-limited per email. The "Continue with Google" button (`GoogleSignInButton`) appears on signin/register only when the provider is configured.
- **Auth snapshot caching**: session data is cached in Redis (60s TTL) to reduce DB round-trips on every request. Cache is bypassed gracefully when Redis is unavailable.
- **Rate limiting on auth**: `register` and `resetPassword` are rate-limited by IP via `lib/rateLimit.ts`.
- All `protectedProcedure` / `organizationProcedure` handlers read `ctx.session.user` (cast to `any` for extended fields where TypeScript doesn't infer them from context).

### Role-based authorization

`src/server/authz.ts` — role-check helpers used inside tRPC procedures:

```typescript
isAdmin(user)            // true if role === "ADMIN"
isManagerOrAdmin(user)   // true if role is ADMIN or MANAGER
assertAdmin(user)        // throws FORBIDDEN if not ADMIN
assertCanGrantRole(actor, targetRole)  // throws if actor cannot grant targetRole
```

`UserRole` hierarchy: `ADMIN` > `MANAGER` > `USER`.

**Platform super-admin ("master account").** `User.isSuperAdmin` is a platform-level flag, orthogonal to the org `role`. It gates `superAdminProcedure` (in `src/server/trpc.ts`), used only by the read-only `platform` router for cross-org monitoring at `/admin`. The flag is **never** settable through the app UI — grant it out-of-band with `npx tsx scripts/grant-superadmin.ts <email>` (append `--revoke` to remove). It flows through the auth snapshot → JWT → session like `role`, so changes propagate within the 60s snapshot TTL (the grant script invalidates the user's auth snapshot so it takes effect on the next refresh without a re-login — it deliberately does **not** bump `sessionVersion`, which is the credential-revocation counter and would log the user out). Never add a mutation to the `platform` router — monitoring must not alter tenant data.

### Multi-tenancy

Every organization-scoped model (`Lead`, `ScraperJob`, `LeadTag`, `Team`, `Pipeline`, etc.) is filtered by `organizationId` taken from the session token. **New feature routers must apply this same filter to every org-scoped read and write — no exceptions.**

```typescript
// Pattern used in every organizationProcedure query
where: { organizationId: ctx.organizationId }
// or using the cast pattern in protectedProcedure:
where: { organizationId: (ctx.session.user as any).organizationId }
```

### Team-based lead scoping

`src/server/teams/scope.ts` — `resolveLeadScope(ctx)` returns a Prisma `where` fragment that restricts which leads a user can see based on their role:

- **ADMIN**: all leads in the organization
- **MANAGER / team leader**: leads assigned to anyone on their team
- **USER**: only their own assigned leads

The scope result is cached in Redis (60s TTL) and memoized per-request. Call `invalidateLeadScope(organizationId)` after any team membership change to bust the cache.

### Caching strategy

All caching uses `src/lib/cache.ts` (read-through helper) backed by `src/lib/redis.ts` (ioredis singleton). Both modules fail open when Redis is unavailable so the app works without Redis.

| What | TTL | Key pattern |
|------|-----|-------------|
| Auth snapshot (session user fields) | 60s | `auth:snapshot:{userId}` |
| Dashboard KPI stats | 60s | `dashboard:kpi:{orgId}` |
| Team lead scope | 60s | `scope:leads:{orgId}:{userId}` |
| Billing subscription snapshot | 60s | `billing:sub:{orgId}` |

### Rate limiting

`src/lib/rateLimit.ts` — fixed-window limiter using Redis `INCR` + `EXPIRE`. Fails open when Redis is unavailable.

```typescript
const { ok, remaining, resetAt } = await rateLimit(key, limit, windowSeconds)
await assertWithinRateLimit(key, limit, windowSeconds)  // throws TRPCError on exhaustion
```

Used on: `auth.register` (IP), `auth.resetPassword` (IP + email).

### Activity logging

`src/server/activity.ts` — `logActivity(prisma, payload)` writes rows to the `Activity` table. Activity types include `LEAD_CREATED`, `LEAD_ASSIGNED`, `CALL_LOGGED`, `TASK_COMPLETED`, etc. Call this helper from procedures that mutate lead-related state.

### Page layout

All authenticated pages wrap their content in `<DashboardLayout>` (from `src/components/layout/DashboardLayout.tsx`), which renders the `Sidebar` + `Header` + main content area + `Toaster`. Pages live in `src/app/<section>/page.tsx` and import feature components from `src/features/<feature>/components/`.

Inside `DashboardLayout`, page content uses `<PageShell>` (from `src/components/layout/PageShell.tsx`) for the standard `crm-content` wrapper plus optional `title` / `subtitle` / `actions` page head — do not hand-roll `crm-content` / `crm-page-head` markup on new pages. Auth pages (signin, register, reset-password, accept-invite) use `<AuthShell>` + `<AuthCard>` from `src/features/auth/components/AuthShell.tsx`.

---

## Feature Map

| Feature | Page route | tRPC namespace | Components | Status |
|---------|-----------|---------------|-----------|--------|
| Dashboard | `/dashboard` | `dashboard` | KPI cards, recent calls, upcoming tasks | Implemented |
| Leads | `/leads` | `leads` | `LeadsList`, `LeadDetailsModal`, `ImportLeadsDialog` | Implemented |
| Dialer | `/dialer` | `calls` | `Dialer` (keypad + call sim) | Implemented |
| Tasks | `/tasks` | `tasks` | `TasksList` | Implemented |
| Scraper | `/scraper` | `scraper` | `ScraperPanel`, `StartJobForm`, `JobsTable`, `JobDetailDialog` | Implemented |
| Teams | `/team`, `/team/[userId]` | `teams` | `TeamPage`, `TeamMemberDetail` | Implemented |
| Pipeline | `/pipeline` | `pipeline` | pipeline board (stages + drag) | Implemented |
| Analytics | `/analytics` | `analytics` | analytics dashboards | Implemented |
| Emails | (in lead modal) | `emails` | `EmailDraftPanel` (CAN-SPAM outreach + tracking) | Implemented |
| Scripts | `/scripts`, `/dialer`, lead modal | `scripts` | `ScriptsPanel` | Implemented |
| Settings | `/settings`, `/settings/scoring` | `auth.*`, `teams.*`, `leads.*Tag`, `billing.*`, `scoring.*` | Profile + Members + Tags + Billing tabs; scoring rules page | Implemented |
| Outreach | `/outreach` | `outreach` | `OutreachQueue` (review + bulk-send auto-generated drafts) | Implemented |
| Map | `/map` | `map` | `LeadMap` (OSM lead map: discover businesses, select pins, enrich contact details) | Implemented |
| Billing | `/settings` (Billing tab) | `billing` | `BillingPanel` (Stripe checkout/portal, plan + seat usage) | Implemented |
| Platform Admin | `/admin` | `platform` | super-admin monitoring console (all orgs / teams / users) | Implemented |
| Trainer | `/trainer` | `trainer` | voice call practice with ElevenLabs personas + AI scorecards | Implemented |
| Calendar | `/calendar` | `tasks` | task calendar view (standalone page) | Implemented |

### Key tRPC procedures per namespace

| Namespace | Procedures |
|-----------|-----------|
| `leads` | `getAll`, `getById`, `create`, `bulkCreate`, `delete`, `bulkDelete`, `updateCallOutcome`, `updateTemperatureOverride`, `toggleStar`, `assign`, `createNote`, `getNotes`, `deleteNote`, `getActivities`, `customOutcomes.*` |
| `calls` | `logCall`, `getForLead`, `getRecent` |
| `tasks` | `create`, `update`, `delete`, `getAll`, `getCalendar`, `getAllForLead`, `getDueToday`, `getOverdue` |
| `scraper` | `config`, `list`, `getById`, `start`, `stop`, `delete`, `importResults`, `previewResults` |
| `dashboard` | `getKpiStats`, `sidebarCounts`, `getTeamStats`, `getMyStats` |
| `auth` | `register`, `resetPassword`, `confirmResetPassword`, `updateProfile`, `deleteAccount` |
| `teams` | `list`, `organizationMembers`, `myTeam`, `activityFeed`, `memberDetail`, `create`, `update`, `delete`, `setMembership`, `inviteByEmail`, `listInvitations`, `revokeInvitation`, `getInvitation`, `acceptInvitation` |
| `scoring` | `getRules`, `upsertRule`, `deleteRule`, `resetToDefaults` |
| `websites` | `getForLead`, `generate`, `update`, `delete` |
| `outreach` | `stats`, `list`, `retry`, `bulkSend` |
| `map` | `discoveryCategories`, `leadsInBounds`, `missingCoordinatesCount`, `geocodeMissing`, `discoverBusinesses`, `enrich`, `enrichmentStatus` |
| `trainer` | `listPersonas`, `createPersona`, `updatePersona`, `deletePersona`, `startSession`, `scoreSession`, `getSessions`, `pickableLeads` |
| `billing` | `getSubscription`, `createCheckoutSession`, `createPortalSession` |
| `platform` | `overview`, `organizations`, `users`, `organizationDetail` (all read-only, super-admin only) |

---

## Database

Prisma schema at `prisma/schema.prisma` (`provider = "postgresql"`). Both dev and prod use PostgreSQL — locally easiest via `docker compose up`. There is a committed migration history under `prisma/migrations/`; `prisma db push` is still convenient for fast local iteration. Under `docker compose`, a dedicated `migrate` sidecar service syncs the schema before the `app` service starts (`depends_on: migrate: { condition: service_completed_successfully }`); `docker-entrypoint.sh` itself just runs `exec node server.js`.

FK relations use `onDelete: Cascade` for owned rows (e.g. deleting a `Lead` removes its `CallLog`/`Note`/`Activity`/`Task`) and `onDelete: SetNull` where the parent is optional context (e.g. `assignedTo` on `Lead`).

### Key models

```
Organization → User → Lead → CallLog
                           → Note
                           → Activity
                           → Task
                           → LeadTag (m:n)
Organization → Team → User
Organization → Pipeline → PipelineStage
Organization → ScraperJob
Organization → LeadTag
Organization → PasswordResetToken
Organization → OrganizationSubscription
Organization → TrainingPersona → TrainingSession
```

NextAuth tables (`Account`, `Session`, `VerificationToken`) also live in the schema but are managed by `@auth/prisma-adapter` — generally don't touch them.

### Enums

| Enum | Values |
|------|--------|
| `UserRole` | `ADMIN`, `MANAGER`, `USER` |
| `LeadStatus` | `NOT_CONTACTED`, `CONNECTED`, `AI_VOICEMAIL`, `NO_ANSWER`, `HUNG_UP` |
| `CallStatus` | `BUSY`, `NO_ANSWER`, `CONNECTED`, `FAILED`, `CANCELED` |
| `CallOutcome` | `NOT_CONTACTED`, `ANSWERED`, `HUNG_UP`, `NO_ANSWER`, `AI_VOICEMAIL` (denormalized onto `Lead`) |
| `ScraperJobStatus` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `STOPPED` |
| `PlanTier` | `STARTER`, `PRO`, `BUSINESS` |
| `SubscriptionStatus` | `NONE`, `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `UNPAID` |

### Key indexes

Composite indexes added for common query patterns:

- `(organizationId, createdAt)` — Lead and ScraperJob listing
- `(organizationId, status)` — Lead status filtering
- `(organizationId, company, phone)` — deduplication on bulk import
- `(organizationId, assignedToId)` — team scope filtering
- `(userId, createdAt)` — Task due-date queries

---

## Scraper system

The lead scraper (`/scraper`) generates leads from Google Maps.

- **Backend**: `src/server/scraper/` — `runner.ts` spawns `scraper.py` as a child process, buffers logs, tracks job state in-memory.
- **Config** (`src/server/scraper/config.ts`): categories (Mobile Mechanics, Power washing, Landscaping, etc.), server max limits (50 locations, 200 records, 4 concurrency), paths via env vars. Per-org caps are enforced by plan tier via `clampScraperInput()` in `src/features/billing/server/enforcement.ts` (STARTER: 10/50, PRO/BUSINESS: 50/200).
- **Output**: CSV files written to `scraper-output/{jobId}/`.
- **Import**: `src/server/scraper/importer.ts` parses CSV (PapaParse), deduplicates by `(company, normalized_phone)`, and bulk-inserts leads.
- **Jobs**: persisted in `ScraperJob` DB model; active job registry is in-memory (server restart clears it). `runner.ts` uses a `globalThis`-based registry to survive Next.js hot-reload.
- **Auto-import**: `ScraperJob.autoImport` flag triggers import on completion.
- **Auto-outreach**: `ScraperJob.autoOutreach` flag (opt-in) enqueues imported leads into the outreach pipeline.

---

## Automated outreach pipeline

Scraper import → `OutreachJob` queue → cron worker → review queue at `/outreach`.

- **Enqueue** (`src/features/outreach/server/enqueue.ts`): called after auto-import (runner) and manual `scraper.importResults` when the job's `autoOutreach` flag is set. Idempotent via unique `OutreachJob.leadId`.
- **Worker** (`src/features/outreach/server/worker.ts`): `processOutreachQueue()` claims PENDING jobs atomically, generates an AI demo site (`generateWebsiteForLead`) and email draft (`generateDraftForLead`) per lead, skips leads with no email / opted out / existing draft, retries failures up to 3 attempts. Never sends — sending is always a user action.
- **Cron** (`POST /api/cron/outreach`): Bearer `CRON_SECRET` auth (same pattern as the scraper cron); run every 1–5 minutes. Batch size via `OUTREACH_BATCH_SIZE` (default 5).
- **Shared services**: `src/features/websites/server/service.ts` (`generateWebsiteForLead`) and `src/features/emails/server/service.ts` (`generateDraftForLead`, `sendDraft`, `OutreachEmailError`) are the single code path used by both the tRPC routers and the worker.
- **Photos**: Google Places photos → Pexels stock fallback (`src/lib/stockPhotos.ts`, `PEXELS_API_KEY`) → Maps-embed fallback.
- **Email capture**: `scraper.py` extracts emails from the Maps panel, the homepage body (free — already fetched during the website check), and `/contact`-style pages; `importer.ts` sanitizes and maps the CSV `Email` column onto `Lead.email`.

---

## Billing and plan enforcement

Stripe subscriptions gate org-scoped mutations and resource limits.

- **Router** (`src/features/billing/server/router.ts`): `getSubscription`, `createCheckoutSession` (admin), `createPortalSession` (admin). UI lives in Settings → Billing tab.
- **Webhook** (`POST /api/webhooks/stripe`): syncs `OrganizationSubscription` from Stripe events; idempotent via `StripeWebhookEvent`.
- **Plans** (`src/features/billing/server/plans.ts`): `STARTER` / `PRO` / `BUSINESS` tiers with seat, tag, and scraper limits. New orgs get a 14-day STARTER trial (`TRIAL_DAYS = 14`).
- **Middleware** (`src/server/trpc.ts`): `organizationProcedure` calls `assertSubscriptionActiveForOrg` on every mutation except `billing.*`.
- **Per-feature limits** (`src/features/billing/server/enforcement.ts`): seat invites (`assertSeatAvailable`), tag CRUD (`assertTagLimit`), scraper jobs (`clampScraperInput`). Used in `teams`, `leads`, and `scraper` routers.
- **Graceful degradation**: when Stripe env vars are unset, billing UI shows "not configured" but the app still runs on trial/default limits.

---

## Voice call trainer

Practice calls against AI personas powered by ElevenLabs Conversational AI.

- **Router** (`src/features/trainer/server/router.ts`): persona CRUD (admin), `startSession` (signed ElevenLabs URL + lead context), `scoreSession` (AI scorecard, rate-limited), session history.
- **Lead context** (`src/features/trainer/leadContext.ts`): interpolates lead fields into persona prompts.
- **Scoring** (`src/features/trainer/server/scoring.ts`): post-call scorecard generation via DeepSeek/heuristics.
- **Requires** `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` for live sessions.

---

## UI conventions

- **CSS**: Tailwind CSS v4 (`@tailwindcss/postcss`)
- **Components**: in `src/components/ui/` — thin wrappers around `@base-ui/react` (MUI Base UI) primitives. The `shadcn` CLI is present in package.json for scaffolding helpers but the runtime primitives are Base UI, not Radix. Reuse the existing components in `src/components/ui/` before adding new ones.
- **Icons**: lucide-react
- **Toast notifications**: sonner (`toast.success()`, `toast.error()`)
- **Animation**: framer-motion (used sparingly)
- **Forms**: react-hook-form + Zod resolvers
- **`cn()` utility**: `src/lib/utils.ts` — combines `clsx` + `tailwind-merge`
- **Path alias**: `@/` maps to `src/`
- **Dates**: date-fns v4

---

## Testing

Vitest + jsdom + React Testing Library. Setup file: `src/test/setup.ts`. The `@` alias resolves to `src/`.

Test files live in two patterns:
- **Co-located**: `Foo.test.tsx` / `router.test.ts` next to the source (most tests, including every feature router under `src/features/*/server/` and several components).
- **`__tests__/` subdirectory**: e.g. `src/app/auth/signin/__tests__/page.test.tsx` for page-level tests.

### Test files

| File | Covers |
|------|--------|
| `src/lib/auth.test.ts` | NextAuth config, JWT callbacks |
| `src/lib/rateLimit.test.ts` | Rate limiter logic, Redis failure paths |
| `src/server/authz.test.ts` | Role-check helpers |
| `src/server/scraper/config.test.ts` | Scraper config defaults & env overrides |
| `src/server/scraper/importer.test.ts` | CSV parsing, dedup, bulk insert |
| `src/server/scraper/sanitize.test.ts` | Location normalization |
| `src/features/auth/server/router.test.ts` | Auth procedures |
| `src/features/leads/server/router.test.ts` | Leads CRUD + pagination |
| `src/features/calls/server/router.test.ts` | Call log procedures |
| `src/features/tasks/server/router.test.ts` | Task procedures |
| `src/features/scraper/server/router.test.ts` | Scraper job procedures |
| `src/features/dashboard/server/router.test.ts` | KPI stats + caching |
| `src/features/teams/server/router.test.ts` | Team CRUD + membership |
| `src/features/billing/server/router.test.ts` | Billing checkout + subscription queries |
| `src/features/billing/server/enforcement.test.ts` | Plan limits + subscription gating |
| `src/features/billing/server/webhook.test.ts` | Stripe webhook sync |
| `src/features/trainer/server/router.test.ts` | Trainer personas + sessions |
| `src/features/map/server/router.test.ts` | Map discovery + enrichment |
| `src/features/pipeline/server/router.test.ts` | Pipeline board procedures |
| `src/features/outreach/server/router.test.ts` | Outreach queue procedures |
| `src/features/analytics/server/router.test.ts` | Analytics aggregations |
| `src/features/leads/components/LeadsList.test.tsx` | LeadsList component |
| `src/features/calls/components/Dialer.test.tsx` | Dialer component |
| `src/features/tasks/components/TasksList.test.tsx` | TasksList component |
| `src/app/auth/signin/__tests__/page.test.tsx` | Sign-in page |
| `src/proxy.test.ts` | Auth proxy boundary |

Every feature router under `src/features/*/server/` has a co-located `router.test.ts`; see `src/**/*.test.{ts,tsx}` for the full list (~65 files).

Coverage thresholds (vitest.config.ts): 60% lines/functions, 50% branches for routers and scraper utilities.

Test mocks include: ioredis (graceful failure), IntersectionObserver, PointerEvent (jsdom gaps).

---

## Karpathy-Inspired Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Key conventions for AI assistants

1. **Always filter by `organizationId`** in any new tRPC procedure that reads org-scoped data.
2. **Use `organizationProcedure`** for org-scoped operations; `protectedProcedure` only when org context is not needed; `publicProcedure` only for auth endpoints.
3. **Validate all inputs with Zod** before business logic in every procedure.
4. **Register new routers** in `src/server/api/root.ts` — the root router is the single source of truth.
5. **Schema changes**: add a migration under `prisma/migrations/` (the committed history is the source of truth for `docker compose`'s `migrate` sidecar); `prisma db push` is fine for quick local iteration.
6. **Add pages** under `src/app/<section>/page.tsx` and mark them `"use client"` if they use tRPC hooks or browser APIs.
7. **Use the existing `src/components/ui/` primitives** (`@base-ui/react` wrappers) before writing new ones — the convention is shared even if the underlying library isn't shadcn.
8. **Session user fields** (`id`, `role`, `organizationId`, `teamId`) require a cast: `(ctx.session.user as any).organizationId`. Use `ctx.organizationId` in `organizationProcedure` context directly.
9. **Desktop app**: `src-tauri/` contains a WIP Tauri wrapper — do not modify it unless explicitly asked.
10. **Scraper jobs** are tracked in-memory; do not rely on job status surviving a server restart without querying the DB.
11. **Role checks**: use helpers from `src/server/authz.ts` (`assertAdmin`, `isManagerOrAdmin`, etc.) rather than inline role string comparisons.
12. **Lead scope**: when listing leads, use `resolveLeadScope(ctx)` from `src/server/teams/scope.ts` to respect ADMIN/MANAGER/USER visibility rules.
13. **Rate limiting**: apply `assertWithinRateLimit()` to any unauthenticated or sensitive mutation (especially auth flows).
14. **Activity logging**: call `logActivity()` from `src/server/activity.ts` for mutations that affect lead state — keeps the audit trail complete.
15. **Redis is optional**: all Redis operations must fail open. Use the safe helpers in `src/lib/redis.ts` (`safeGet`, `safeSetEx`, `safeDel`) rather than direct ioredis calls that throw.
16. **Plan limits**: when adding org-scoped resources (seats, tags, scraper jobs), use helpers from `src/features/billing/server/enforcement.ts`. New mutations on `organizationProcedure` are automatically subscription-gated unless they live under `billing.*`.

---

## Agent skills

### Issue tracker

GitHub Issues on `JMAN730/OPENCRM` via the `gh` CLI; external PRs are a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles use default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` at the repo root; architectural decision records go in `docs/adr/` (created with the first ADR). See `docs/agents/domain.md`.
