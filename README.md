# Modern CRM

A production-ready CRM platform built for high-volume sales teams, featuring intelligent lead management, integrated smart dialer, and AI-powered analytics.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15+-black?style=flat&logo=nextjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat&logo=typescript)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Latest-336791?style=flat&logo=postgresql)](https://www.postgresql.org)

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Features

- **📊 Intelligent Dashboard** – Real-time overview of sales performance, pipeline metrics, and team activity.
- **👥 Lead Management** – Full CRUD operations with pipeline tracking, lead scoring, and bulk operations.
- **☎️ Smart Dialer** – Integrated calling system optimized for high-volume cold calling campaigns.
- **✅ Task Management** – Built-in task tracking to keep teams organized and accountable.
- **📈 Advanced Analytics** – Data-driven insights into team productivity, conversion rates, and KPIs.
- **🔐 Multi-Tenant Architecture** – Secure organization isolation with role-based access control.
- **🤖 AI-Powered Insights** – OpenAI integration for intelligent lead analysis and outreach suggestions.

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Next.js 15+ (App Router) |
| **Authentication** | NextAuth.js with Prisma Adapter |
| **Database** | Prisma ORM with PostgreSQL |
| **API Layer** | tRPC with TypeScript validation |
| **UI/Styling** | Tailwind CSS + Shadcn/UI Components |
| **Testing** | Vitest + React Testing Library |
| **Phone** | Twilio SDK |
| **Cloud Storage** | AWS S3 (optional) |
| **Real-time** | Redis (optional, for caching) |

## Quick Start

### Prerequisites

- Node.js 18+ and npm/yarn
- PostgreSQL 12+
- (Optional) Twilio account for dialer features
- (Optional) OpenAI API key for AI features

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/crm.git
   cd crm
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your configuration:
   ```dotenv
   # Database
   DATABASE_URL="postgresql://user:password@localhost:5432/crm_db?schema=public"

   # NextAuth
   NEXTAUTH_SECRET="your-generated-secret-here"
   NEXTAUTH_URL="http://localhost:3000"

   # OAuth (optional)
   GOOGLE_CLIENT_ID="..."
   GOOGLE_CLIENT_SECRET="..."

   # AI Features (optional)
   OPENAI_API_KEY="..."

   # Twilio (optional)
   TWILIO_ACCOUNT_SID="..."
   TWILIO_AUTH_TOKEN="..."

   # AWS S3 (optional)
   AWS_REGION="us-east-1"
   AWS_ACCESS_KEY_ID="..."
   AWS_SECRET_ACCESS_KEY="..."
   ```

4. **Initialize the database:**
   ```bash
   npx prisma db push
   npx prisma studio  # (optional) Open GUI to inspect database
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development Setup

### Available Commands

```bash
# Development
npm run dev          # Start dev server (http://localhost:3000)

# Building
npm run build        # Production build
npm run start        # Start production server

# Quality Checks
npm run lint         # Run ESLint

# Testing
npx vitest           # Run tests in watch mode
npx vitest run       # Run tests once
npx vitest src/features/leads/components/LeadsList.test.tsx  # Single test file

# Database Management
npx prisma db push   # Sync schema to database
npx prisma studio   # Open Prisma Studio GUI
```

### Code Style

This project uses ESLint for code quality. Run `npm run lint` before committing to ensure compliance.

## Project Structure

```
src/
├── app/                          # Next.js App Router pages and layouts
│   ├── api/trpc/[trpc]/         # tRPC API route handler
│   ├── dashboard/               # Dashboard pages
│   ├── leads/                   # Lead management pages
│   ├── tasks/                   # Task management pages
│   └── auth/                    # Authentication pages
├── features/                     # Feature modules (leads, calls, outreach, etc.)
│   ├── leads/
│   │   ├── components/          # Lead-specific UI components
│   │   ├── hooks/               # Lead-related custom hooks
│   │   └── server/
│   │       ├── router.ts        # tRPC router for leads
│   │       └── services/        # Business logic
│   └── [other-features]/
├── server/                       # Backend configuration
│   ├── api/
│   │   └── root.ts              # Root tRPC router
│   └── trpc.ts                  # tRPC context and procedures
├── components/                   # Shared/global UI components
│   ├── layout/
│   ├── ui/                      # Shadcn/UI components
│   └── Providers.tsx            # Global providers (NextAuth, tRPC, QueryClient)
├── lib/
│   ├── auth.ts                  # NextAuth configuration
│   └── utils.ts                 # Utility functions
└── test/                         # Test configuration
    └── setup.ts                 # Vitest setup
prisma/
└── schema.prisma                # Database schema definition
```

## Architecture

### Request Flow

```
Client Component
    ↓
trpc.<router>.<procedure>
    ↓
HTTP POST /api/trpc
    ↓
tRPC Handler (src/server/api/root.ts)
    ↓
Feature Router (src/features/<feature>/server/router.ts)
    ↓
Prisma Client
    ↓
PostgreSQL Database
```

### Key Architectural Patterns

**tRPC Setup:**
- **Context** (`src/server/trpc.ts`): Injects Prisma client and session into every request
- **Procedures**: `publicProcedure` (unauthenticated) and `protectedProcedure` (authenticated)
- **Root Router** (`src/server/api/root.ts`): Merges all feature routers

**Multi-Tenancy:**
- Every data model is scoped to `organizationId`
- Session includes `organizationId` and `userId` from JWT token
- All queries automatically filter by the user's organization

**Authentication:**
- NextAuth.js with JWT sessions
- Session extended with custom fields: `id`, `role`, `organizationId`
- Demo mode auto-creates user + "Demo Organization" on first login

### Adding a New Feature

1. Create the router: `src/features/<feature>/server/router.ts`
2. Define procedures using `createTRPCRouter({...})`
3. Register in `src/server/api/root.ts`: `<feature>: <feature>Router`
4. Use in components: `trpc.<feature>.<procedure>.useQuery/useMutation()`

See `ARCHITECTURE.md` for detailed guidance.

## Testing

Tests are co-located with components using **Vitest** and **React Testing Library**.

```bash
# Run all tests in watch mode
npx vitest

# Run tests once
npx vitest run

# Run specific test file
npx vitest src/features/leads/components/LeadsList.test.tsx

# Generate coverage report
npx vitest run --coverage
```

Test setup is in `src/test/setup.ts`.

## Deployment

### Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Environment variables are configured in the Vercel dashboard.

### Deploy to Docker

```bash
docker build -t modern-crm .
docker run -p 3000:3000 --env-file .env.production modern-crm
```

### Database Migrations

Use `npx prisma db push` to sync schema changes to production.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Setting up your development environment
- Code style and conventions
- Testing requirements
- Submitting pull requests
- Reporting issues

## Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## Security

If you discover a security vulnerability, please email security@example.com instead of using the issue tracker. See [SECURITY.md](SECURITY.md) for details.

## License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/yourusername/crm/issues)
- 💬 [Discussions](https://github.com/yourusername/crm/discussions)

---

**Made with ❤️ for sales teams**
