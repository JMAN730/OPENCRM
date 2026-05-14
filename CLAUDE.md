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

# Optional – Twilio (calling features)
TWILIO_ACCOUNT_SID="..."
TWILIO_AUTH_TOKEN="..."
TWILIO_PHONE_NUMBER="..."

# Optional – AI features
OPENAI_API_KEY="..."

# Optional – File storage
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="..."
AWS_S3_BUCKET="..."

# Optional – Caching
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

# Optional – Trusted proxy (for X-Forwarded-For IP extraction)
TRUSTED_PROXY="true"
```

## Architecture

### Request flow

Client component → `trpc.<router>.<procedure>` (from `src/app/_trpc/client.ts`) → HTTP POST `/api/trpc` → tRPC handler (`src/app/api/trpc/[trpc]/route.ts`) → procedure in `src/features/<feature>/server/router.ts` → Prisma → Database.

### tRPC setup

- **Context** (`src/server/trpc.ts`): attaches `prisma` client, `session`, and `organizationId` to every request. Also revalidates deleted-user sessions on every call.
- **Procedures**:
  - `publicProcedure` — unauthenticated (auth endpoints only)
  - `protectedProcedure` — throws `UNAUTHORIZED` if no valid session
  - `organizationProcedure` — extends `protectedProcedure`; additionally throws `UNAUTHORIZED` if `organizationId` is missing from the session
- **Root router** (`src/server/api/root.ts`): merges all feature routers.
- **Client** (`src/app/_trpc/client.ts`): typed `trpc` hook object, imported in any client component.
- **Provider** (`src/app/_trpc/Provider.tsx` + `src/components/Providers.tsx`): wraps the app in `SessionProvider` → `TRPCProvider` → `QueryClientProvider`.
- **Error formatting**: Zod validation errors are flattened into `fieldErrors` in the tRPC error response.

### Root router — registered namespaces

```typescript
// src/server/api/root.ts
appRouter = {
  leads:     leadsRouter,     // full CRUD + bulk import + cursor pagination
  calls:     callsRouter,     // call logging + retrieval
  scraper:   scraperRouter,   // Google Maps lead scraper
  tasks:     tasksRouter,     // task CRUD + filtering
  dashboard: dashboardRouter, // KPI aggregations (Redis-cached)
  auth:      authRouter,      // register, login helpers, password reset, profile
  teams:     teamsRouter,     // team CRUD + member management
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
- **Google OAuth**: enabled when `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set.
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
| Outreach | `/outreach` | — | — | Stub |
| Analytics | `/analytics` | — | — | Stub |
| Settings | `/settings` | — | — | Stub |

### Key tRPC procedures per namespace

| Namespace | Procedures |
|-----------|-----------|
| `leads` | `getAll` (cursor pagination + scope-aware), `getById`, `create`, `update`, `updateCallOutcome`, `delete`, `bulkImport`, `bulkDelete`, `getNotes`, `getActivities` |
| `calls` | `logCall`, `getForLead`, `recentCalls` |
| `tasks` | `create`, `getForUser`, `getForLead`, `update`, `delete`, `complete` |
| `scraper` | `config`, `list`, `start`, `stop`, `getDetail`, `importJob` |
| `dashboard` | `getKpiStats` |
| `auth` | `register`, `resetPassword`, `confirmResetPassword`, `updateProfile`, `deleteAccount` |
| `teams` | `list`, `getTeam`, `create`, `update`, `delete`, `addMember`, `removeMember`, `setLeader` |

---

## Database

Prisma schema at `prisma/schema.prisma` (`provider = "postgresql"`). Uses `prisma db push` (no migration history). Both dev and prod use PostgreSQL — locally easiest via `docker compose up`. The `docker-entrypoint.sh` runs `prisma db push --skip-generate` on container start so the schema is always synced.

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

`Pipeline` / `PipelineStage` exist in the schema but are not yet surfaced in the UI.

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
- **Config** (`src/server/scraper/config.ts`): categories (Mobile Mechanics, Power washing, Landscaping, etc.), max limits (50 locations, 200 records, 4 concurrency), paths via env vars.
- **Output**: CSV files written to `scraper-output/{jobId}/`.
- **Import**: `src/server/scraper/importer.ts` parses CSV (PapaParse), deduplicates by `(company, normalized_phone)`, and bulk-inserts leads.
- **Jobs**: persisted in `ScraperJob` DB model; active job registry is in-memory (server restart clears it). `runner.ts` uses a `globalThis`-based registry to survive Next.js hot-reload.
- **Auto-import**: `ScraperJob.autoImport` flag triggers import on completion.

---

## UI conventions

- **CSS**: Tailwind CSS v4 (`@tailwindcss/postcss`)
- **Components**: shadcn/ui (in `src/components/ui/`) — use existing components before adding new ones
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
| `src/features/leads/components/LeadsList.test.tsx` | LeadsList component |
| `src/features/leads/components/LeadDetailsModal.test.tsx` | LeadDetailsModal component |
| `src/features/calls/components/Dialer.test.tsx` | Dialer component |
| `src/features/tasks/components/TasksList.test.tsx` | TasksList component |
| `src/app/auth/signin/__tests__/page.test.tsx` | Sign-in page |
| `src/proxy.test.ts` | Auth proxy boundary |

Coverage thresholds (vitest.config.ts): 60% lines/functions, 50% branches for routers and scraper utilities.

Test mocks include: ioredis (graceful failure), IntersectionObserver, PointerEvent (jsdom gaps).

---

## Key conventions for AI assistants

1. **Always filter by `organizationId`** in any new tRPC procedure that reads org-scoped data.
2. **Use `organizationProcedure`** for org-scoped operations; `protectedProcedure` only when org context is not needed; `publicProcedure` only for auth endpoints.
3. **Validate all inputs with Zod** before business logic in every procedure.
4. **Register new routers** in `src/server/api/root.ts` — the root router is the single source of truth.
5. **Use `prisma db push`**, not `prisma migrate` — there is no migration history.
6. **Add pages** under `src/app/<section>/page.tsx` and mark them `"use client"` if they use tRPC hooks or browser APIs.
7. **Use shadcn/ui components** from `src/components/ui/` before writing custom primitives.
8. **Session user fields** (`id`, `role`, `organizationId`, `teamId`) require a cast: `(ctx.session.user as any).organizationId`. Use `ctx.organizationId` in `organizationProcedure` context directly.
9. **Desktop app**: `src-tauri/` contains a WIP Tauri wrapper — do not modify it unless explicitly asked.
10. **Scraper jobs** are tracked in-memory; do not rely on job status surviving a server restart without querying the DB.
11. **Role checks**: use helpers from `src/server/authz.ts` (`assertAdmin`, `isManagerOrAdmin`, etc.) rather than inline role string comparisons.
12. **Lead scope**: when listing leads, use `resolveLeadScope(ctx)` from `src/server/teams/scope.ts` to respect ADMIN/MANAGER/USER visibility rules.
13. **Rate limiting**: apply `assertWithinRateLimit()` to any unauthenticated or sensitive mutation (especially auth flows).
14. **Activity logging**: call `logActivity()` from `src/server/activity.ts` for mutations that affect lead state — keeps the audit trail complete.
15. **Redis is optional**: all Redis operations must fail open. Use the safe helpers in `src/lib/redis.ts` (`safeGet`, `safeSetEx`, `safeDel`) rather than direct ioredis calls that throw.
