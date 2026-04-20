# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint

npx vitest           # Run all tests
npx vitest run       # Run tests once (no watch)
npx vitest src/features/leads/components/LeadsList.test.tsx  # Run a single test file

npx prisma db push   # Sync schema to database (no migrations generated)
npx prisma studio    # Open Prisma Studio GUI
```

## Environment

Create a `.env` file:
```dotenv
DATABASE_URL="postgresql://user:password@host:port/database?schema=public"
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="..."       # optional
GOOGLE_CLIENT_SECRET="..."   # optional
```

## Architecture

### Request flow

Client component → `trpc.<router>.<procedure>` (from `src/app/_trpc/client.ts`) → HTTP POST `/api/trpc` → tRPC handler → procedure in `src/features/<feature>/server/router.ts` → Prisma → PostgreSQL.

### tRPC setup

- **Context** (`src/server/trpc.ts`): attaches `prisma` client and `session` to every request.
- **Procedures**: `publicProcedure` (unauthenticated) and `protectedProcedure` (throws `UNAUTHORIZED` if no session).
- **Root router** (`src/server/api/root.ts`): merge feature routers here. Currently only `leads` is wired up — add others as `<feature>: <feature>Router`.
- **Client** (`src/app/_trpc/client.ts`): typed `trpc` hook object, imported in any client component.
- **Provider** (`src/app/_trpc/Provider.tsx` + `src/components/Providers.tsx`): wraps the app in `SessionProvider` → `TRPCProvider` → `QueryClientProvider`.

### Adding a new feature router

1. Create `src/features/<feature>/server/router.ts` exporting a `createTRPCRouter({...})`.
2. Register it in `src/server/api/root.ts`.
3. Use `trpc.<feature>.<procedure>.useQuery/useMutation()` in client components.

### Authentication

`src/lib/auth.ts` — NextAuth with JWT sessions. `session.user` is extended with `id`, `role`, and `organizationId` via the `jwt`/`session` callbacks. All `protectedProcedure` handlers read `ctx.session.user` and cast to `any` for these extra fields (no type augmentation yet).

The Credentials provider auto-creates a user + "Demo Organization" on first login — no password validation exists; it is demo-only.

### Multi-tenancy

Every `Lead` (and organization-scoped data) is filtered by `organizationId` taken from the session token. New feature routers must apply this same filter.

### Page layout

All authenticated pages wrap their content in `<DashboardLayout>` (from `src/components/layout/DashboardLayout.tsx`), which renders the `Sidebar` + `Header` + main content area + `Toaster`. Pages live in `src/app/<section>/page.tsx` and import feature components from `src/features/<feature>/components/`.

### Database

Prisma schema at `prisma/schema.prisma`. Uses `prisma db push` (no migration history). Key models: `Organization` → `User` → `Lead` → `CallLog | Note | Activity | Task`. `Pipeline` / `PipelineStage` exist in the schema but are not yet surfaced in the UI.

### Testing

Vitest + jsdom + React Testing Library. Setup file: `src/test/setup.ts`. Tests co-located with components (`*.test.tsx`). The `@` alias resolves to `src/`.
