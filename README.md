# OpenCRM

A production-ready CRM platform built for high-volume sales teams — lead management, integrated dialer, AI-powered lead scraping, and task tracking, all in one self-hosted package.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat&logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat&logo=typescript)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=flat&logo=prisma)](https://www.prisma.io)

## Features

- **Dashboard** – Real-time KPIs, recent calls, and upcoming tasks at a glance.
- **Lead Management** – Full CRUD, pipeline tracking, bulk CSV import, and status filtering.
- **Smart Dialer** – Simulated call logging optimized for high-volume outreach campaigns.
- **Lead Scraper** – Google Maps scraper that generates leads automatically and imports them on completion.
- **Task Management** – Assign, filter, and track tasks across your team.
- **Multi-Tenant** – Organizations are fully isolated; every query is scoped by `organizationId`.
- **Role-Based Access** – `ADMIN`, `MANAGER`, and `USER` roles with protected API procedures.

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 15 (App Router) |
| API Layer | tRPC v11 with Zod validation |
| Auth | NextAuth.js (credentials + Google OAuth) |
| ORM | Prisma 7 |
| Database | PostgreSQL 16 |
| UI | Tailwind CSS v4 + shadcn/ui |
| Testing | Vitest + React Testing Library |
| Dialer | Twilio SDK (optional) |
| AI | OpenAI API (optional) |
| Storage | AWS S3 (optional) |
| Cache | Redis (optional) |

## Quick Start (Docker Compose)

The fastest way to run the full stack locally:

```bash
git clone https://github.com/JMAN730/OPENCRM.git
cd OPENCRM
cp .env.example .env   # fill in at minimum NEXTAUTH_SECRET
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). The container runs `prisma db push` on startup so the schema is always in sync.

## Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (or use `docker compose up postgres` to run just the DB)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
```

Minimum required variables in `.env`:

```dotenv
DATABASE_URL="postgresql://crm:crm@localhost:5432/crm"
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"

# Docker Compose postgres service
POSTGRES_USER="crm"
POSTGRES_PASSWORD="crm"
POSTGRES_DB="crm"
```

Optional variables:

```dotenv
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
OPENAI_API_KEY="..."
TWILIO_ACCOUNT_SID="..."
TWILIO_AUTH_TOKEN="..."
TWILIO_PHONE_NUMBER="..."
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="..."
AWS_S3_BUCKET="..."
REDIS_URL="redis://localhost:6379"
SCRAPER_ENABLED="false"
```

```bash
# 3. Push schema to DB
npx prisma db push

# 4. Seed initial data (optional)
npm run seed

# 5. Start dev server
npm run dev
```

### Commands

```bash
npm run dev          # Dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint

npx vitest           # Run tests (watch mode)
npx vitest run       # Run tests once

npx prisma db push   # Sync schema to database
npx prisma studio    # Open Prisma Studio GUI

docker compose up --build   # Full stack (Next.js + PostgreSQL)
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/trpc/[trpc]/   # tRPC HTTP handler
│   ├── dashboard/
│   ├── leads/
│   ├── dialer/
│   ├── tasks/
│   ├── scraper/
│   └── auth/
├── features/               # Feature modules
│   ├── leads/
│   │   ├── components/
│   │   └── server/router.ts
│   ├── calls/
│   ├── tasks/
│   ├── dashboard/
│   └── scraper/
├── server/
│   ├── api/root.ts         # Root tRPC router
│   ├── trpc.ts             # Context + procedures
│   └── scraper/            # Scraper runner + importer
├── components/
│   ├── layout/             # DashboardLayout, Sidebar, Header
│   └── ui/                 # shadcn/ui primitives
└── lib/
    ├── auth.ts             # NextAuth config
    └── utils.ts            # cn() helper
prisma/
├── schema.prisma           # Database schema
└── prisma.config.ts        # Prisma 7 datasource config
```

## Architecture

### Request Flow

```
Client component
  → trpc.<router>.<procedure>
  → POST /api/trpc
  → tRPC handler
  → Feature router (src/features/<feature>/server/router.ts)
  → Prisma
  → PostgreSQL
```

### tRPC Namespaces

| Namespace | Description |
|-----------|-------------|
| `auth` | Registration, session (`me`) |
| `leads` | Lead CRUD + bulk import |
| `calls` | Call logging + retrieval |
| `tasks` | Task CRUD + filtering |
| `dashboard` | KPI aggregations |
| `scraper` | Google Maps scraper jobs |

### Adding a Feature

1. Create `src/features/<feature>/server/router.ts`
2. Register it in `src/server/api/root.ts`
3. Use `trpc.<feature>.<procedure>.useQuery/useMutation()` in client components
4. Always filter by `organizationId` in every protected query

## Deployment

The project ships a production-ready `Dockerfile` and `docker-compose.yml`. It is currently deployed on **Hostinger** via Docker Compose.

Hostinger reads `docker-compose.yml` from the repository root, builds the image, and starts the stack. Environment variables are configured in the Hostinger dashboard.

```yaml
# docker-compose.yml summary
services:
  app:   # Next.js (port 3000) — runs prisma db push on start
  postgres:  # PostgreSQL 16-alpine
```

For any other host that supports Docker Compose, the same setup applies — set the environment variables listed above and run `docker compose up --build`.

## Testing

Tests are co-located with components in `*.test.tsx` files.

```bash
npx vitest run                                                    # all tests
npx vitest src/features/leads/components/LeadsList.test.tsx       # single file
npx vitest run --coverage                                         # coverage report
```

## License

MIT — see [LICENSE](LICENSE).

---

[Issues](https://github.com/JMAN730/OPENCRM/issues) · [Discussions](https://github.com/JMAN730/OPENCRM/discussions)
