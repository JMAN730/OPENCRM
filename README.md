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
- Lead CRUD, search, pagination, assignment, notes, and bulk import/delete
- Team management with org-scoped membership controls
- Task list with real edit, complete, and delete actions
- Password reset, auth rate limiting, and deleted-user session invalidation
- Scraper jobs with filtered import back into leads

## What is not implemented yet

- Outreach sequences and delivery automation
- External Twilio, OpenAI, or AWS-backed integrations
- Email-token invite onboarding flow

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

The application container runs `prisma db push` on startup so the schema stays aligned with the current Prisma model.

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
