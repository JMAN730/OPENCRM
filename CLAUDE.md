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
```

## Architecture

### Request flow

Client component → `trpc.<router>.<procedure>` (from `src/app/_trpc/client.ts`) → HTTP POST `/api/trpc` → tRPC handler (`src/app/api/trpc/[trpc]/route.ts`) → procedure in `src/features/<feature>/server/router.ts` → Prisma → Database.

### tRPC setup

- **Context** (`src/server/trpc.ts`): attaches `prisma` client and `session` to every request.
- **Procedures**: `publicProcedure` (unauthenticated) and `protectedProcedure` (throws `UNAUTHORIZED` if no session).
- **Root router** (`src/server/api/root.ts`): merges all feature routers.
- **Client** (`src/app/_trpc/client.ts`): typed `trpc` hook object, imported in any client component.
- **Provider** (`src/app/_trpc/Provider.tsx` + `src/components/Providers.tsx`): wraps the app in `SessionProvider` → `TRPCProvider` → `QueryClientProvider`.

### Root router — registered namespaces

```typescript
// src/server/api/root.ts
appRouter = {
  leads:     leadsRouter,     // full CRUD + bulk import
  calls:     callsRouter,     // call logging + retrieval
  scraper:   scraperRouter,   // Google Maps lead scraper
  tasks:     tasksRouter,     // task CRUD + filtering
  dashboard: dashboardRouter, // KPI aggregations
  auth:      authRouter,      // me query
}
```

### Adding a new feature router

1. Create `src/features/<feature>/server/router.ts` exporting a `createTRPCRouter({...})`.
2. Register it in `src/server/api/root.ts`.
3. Use `trpc.<feature>.<procedure>.useQuery/useMutation()` in client components.

### Authentication

`src/lib/auth.ts` — NextAuth with JWT sessions. Session types are augmented in `src/types/next-auth.d.ts`; `session.user` includes `id`, `role`, and `organizationId` via the `jwt`/`session` callbacks.

- **Registration** (`trpc.auth.register`): creates a new `Organization` and `User` (ADMIN role) with a bcrypt-hashed password. Validated via Zod (min 8-char password, valid email, non-empty name). The legacy `POST /api/auth/register` endpoint has been removed.
- **Credentials provider**: validates email + bcrypt password.
- **Google OAuth**: enabled when `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set.
- All `protectedProcedure` handlers read `ctx.session.user` (cast to `any` for extended fields where TypeScript doesn't infer them from context).

### Multi-tenancy

Every organization-scoped model (`Lead`, `ScraperJob`, `LeadTag`, `Team`, `Pipeline`, etc.) is filtered by `organizationId` taken from the session token. **New feature routers must apply this same filter to every org-scoped read and write — no exceptions.**

```typescript
// Pattern used in every protected query
where: { organizationId: (ctx.session.user as any).organizationId }
```

### Page layout

All authenticated pages wrap their content in `<DashboardLayout>` (from `src/components/layout/DashboardLayout.tsx`), which renders the `Sidebar` + `Header` + main content area + `Toaster`. Pages live in `src/app/<section>/page.tsx` and import feature components from `src/features/<feature>/components/`.

---

## Feature Map

| Feature | Page route | tRPC namespace | Components |
|---------|-----------|---------------|-----------|
| Dashboard | `/dashboard` | `dashboard` | KPI cards, recent calls, upcoming tasks |
| Leads | `/leads` | `leads` | `LeadsList`, `ImportLeadsDialog` |
| Dialer | `/dialer` | `calls` | `Dialer` (keypad + call sim) |
| Tasks | `/tasks` | `tasks` | `TasksList` |
| Scraper | `/scraper` | `scraper` | `ScraperPanel`, `StartJobForm`, `JobsTable`, `JobDetailDialog` |
| Outreach | `/outreach` | — | Stub |
| Analytics | `/analytics` | — | Stub |
| Settings | `/settings` | — | Stub |

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

---

## Scraper system

The lead scraper (`/scraper`) generates leads from Google Maps.

- **Backend**: `src/server/scraper/` — `runner.ts` spawns `scraper.py` as a child process, buffers logs, tracks job state in-memory.
- **Output**: CSV files written to `scraper-output/{jobId}/`.
- **Import**: `src/server/scraper/importer.ts` parses CSV and bulk-inserts leads.
- **Jobs**: persisted in `ScraperJob` DB model; active job registry is in-memory (server restart clears it).
- **Auto-import**: `ScraperJob.autoImport` flag triggers import on completion.

---

## UI conventions

- **CSS**: Tailwind CSS v4 (`@tailwindcss/postcss`)
- **Components**: shadcn/ui (in `src/components/ui/`) — use existing components before adding new ones
- **Icons**: lucide-react
- **Toast notifications**: sonner (`toast.success()`, `toast.error()`)
- **Animation**: framer-motion (used sparingly)
- **`cn()` utility**: `src/lib/utils.ts` — combines `clsx` + `tailwind-merge`
- **Path alias**: `@/` maps to `src/`

---

## Testing

Vitest + jsdom + React Testing Library. Setup file: `src/test/setup.ts`. The `@` alias resolves to `src/`.

Test files live in two patterns:
- **Co-located**: `Foo.test.tsx` / `router.test.ts` next to the source (most tests, including every feature router under `src/features/*/server/` and several components).
- **`__tests__/` subdirectory**: e.g. `src/app/auth/signin/__tests__/page.test.tsx` for page-level tests.

Coverage spans auth (`src/lib/auth.test.ts`, `src/features/auth/server/router.test.ts`), each feature router (`leads`, `tasks`, `scraper`, `calls`, `dashboard`), key components (`LeadsList`, `LeadDetailsModal`, `TasksList`, `Dialer`), and scraper utilities (`src/server/scraper/sanitize.test.ts`).

---

## Key conventions for AI assistants

1. **Always filter by `organizationId`** in any new tRPC procedure that reads org-scoped data.
2. **Use `protectedProcedure`** for anything that requires a logged-in user; `publicProcedure` only for auth endpoints.
3. **Validate all inputs with Zod** before business logic in every procedure.
4. **Register new routers** in `src/server/api/root.ts` — the root router is the single source of truth.
5. **Use `prisma db push`**, not `prisma migrate` — there is no migration history.
6. **Add pages** under `src/app/<section>/page.tsx` and mark them `"use client"` if they use tRPC hooks or browser APIs.
7. **Use shadcn/ui components** from `src/components/ui/` before writing custom primitives.
8. **Session user fields** (`id`, `role`, `organizationId`) require a cast: `(ctx.session.user as any).organizationId`.
9. **Desktop app**: `src-tauri/` contains a WIP Tauri wrapper — do not modify it unless explicitly asked.
10. **Scraper jobs** are tracked in-memory; do not rely on job status surviving a server restart without querying the DB.
