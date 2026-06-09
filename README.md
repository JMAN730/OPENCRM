# OpenCRM

OpenCRM is a self-hosted CRM for sales teams with lead management, team-aware permissions, task tracking, call logging, and a Google Maps scraper import flow.

## Current stack

- Next.js 16
- React 19
- TypeScript 5
- tRPC 11 + Zod
- Prisma 7
- PostgreSQL
- NextAuth credentials auth
- Vitest + Testing Library

## What is implemented

- Dashboard KPIs, recent calls, and due tasks
- Lead CRUD, search, pagination, assignment, notes, bulk import/delete, and CSV export
- Bulk lead temperature override (HOT / WARM / COOL) from the multi-select bar
- AI lead qualification summary (DeepSeek-backed with heuristic fallback) on lead detail
- Team management with org-scoped membership controls and email-token invite flow
- Task list with edit, complete, delete, calendar view, and per-lead task widget
- Password reset, auth rate limiting, and deleted-user session invalidation
- Role-based lead scope (ADMIN sees all; MANAGER sees team; USER sees own)
- Lead-scoring rules engine with configurable per-factor weights
- Scraper jobs with filtered import back into leads
- Scheduled weekly scraper runs (day-of-week + hour, per-org, manager/admin only)
- Custom scraper categories per org (up to 50)
- Pipeline board with drag-and-drop, inline deal value editing, forecast view, and table view
- Per-lead website generator from configurable templates
- Analytics dashboard with 30-day trends and team performance breakdown
- Google OAuth and credentials auth (NextAuth)

## What is not implemented yet

- Outreach sequences and delivery automation
- Interactive dialer calling (Twilio integration stub — disabled until funded)
- Two-way email threading

## Local development

Requirements:

- Node.js 20+
- PostgreSQL 16+

Setup:

```bash
npm install
cp .env.example .env
npx prisma db push
npm run seed
npm run dev
```

Minimum `.env` values:

```dotenv
DATABASE_URL="postgresql://crm:crm@localhost:5432/crm"
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"
POSTGRES_USER="crm"
POSTGRES_PASSWORD="crm"
POSTGRES_DB="crm"
```

## Validation commands

```bash
npm run lint
npm run type-check
npm run test
npm run build
```

## Docker

Run the app and PostgreSQL together:

```bash
docker compose up --build
```

The default Compose stack does not bind ports 80/443, which keeps it compatible with hosted platforms that provide their own reverse proxy. For a bare-server deployment that needs the bundled Traefik proxy and Let's Encrypt, set `APP_DOMAIN` and `ACME_EMAIL`, then run:

```bash
docker compose --profile proxy up --build -d
```

The migration container runs `prisma db push` before the app starts so the schema stays aligned with the current Prisma model.

## Supabase (managed Postgres)

Supabase is just managed PostgreSQL, so the app runs against it with no code
changes — only connection config. Use two connection strings (both require TLS,
hence `?sslmode=require`):

```dotenv
# Runtime — session pooler (IPv4, supports prepared statements):
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
# Migrations / db push — direct connection (DDL needs a real session, not a pooler):
DIRECT_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
```

`prisma db push` uses `DIRECT_URL`; the running app uses `DATABASE_URL`. If your
environment lacks IPv6, point `DIRECT_URL` at the session pooler too. Redis (rate
limiting + caching) is unaffected — Supabase has no Redis, so keep `REDIS_URL`
pointing at your existing/external Redis, or leave it unset (it fails open).

Migrate existing data from a self-hosted Postgres into Supabase (run against the
direct connection — COPY/DDL won't work over a transaction pooler):

```bash
pg_dump "$OLD_DATABASE_URL" --schema=public --no-owner --no-acl -f opencrm-dump.sql
psql "$DIRECT_URL" -f opencrm-dump.sql
DIRECT_URL="$DIRECT_URL" npx prisma db push   # confirms schema is in sync
```

A fresh database instead just needs `npx prisma db push` then `npm run seed`.

## Project structure

```text
src/
  app/                  Next.js routes
  components/           shared UI and layout
  features/             feature modules and tRPC routers
  lib/                  auth, cache, prisma, helpers
  server/               root API router and server utilities
prisma/
  schema.prisma         database schema
  seed.ts               demo seed data
scripts/
  prepare-standalone.mjs
```

## Notes

- `src/proxy.ts` is the request auth boundary for Next.js 16.
- The app is PostgreSQL-only. Old SQLite/libsql packaging hooks have been removed.
- Password-reset email delivery is optional; without SMTP configured, reset links are logged to the server output.
