# Architecture Guide

This document describes the architecture and design patterns used in Open CRM.

## High-Level Overview

Open CRM is built as a full-stack TypeScript application using Next.js 15, tRPC, Prisma, and PostgreSQL. The application follows a feature-based modular architecture with clear separation of concerns.

```
┌─────────────────────────────────────────┐
│         React Components (Client)        │
│  - Dashboard, Leads, Calls, Tasks, etc.  │
└────────────────────┬────────────────────┘
                     │
         tRPC Hooks (Typed API Calls)
                     │
┌────────────────────▼────────────────────┐
│    Next.js API Routes (/api/trpc)       │
│    - tRPC Handler & Middleware           │
└────────────────────┬────────────────────┘
                     │
      tRPC Router (Merged Feature Routers)
                     │
┌────────────────────▼────────────────────┐
│    Feature Routers & Procedures          │
│ - Input Validation (Zod)                │
│ - Authorization Checks                  │
│ - Business Logic (Services)             │
└────────────────────┬────────────────────┘
                     │
         Prisma ORM (Database Layer)
                     │
┌────────────────────▼────────────────────┐
│        PostgreSQL Database              │
└─────────────────────────────────────────┘
```

## Project Structure

### Root Level Files

- **`package.json`** – Dependencies and scripts
- **`.env.local`** – Local environment variables (git-ignored)
- **`.env.example`** – Template for environment variables
- **`next.config.js`** – Next.js configuration
- **`tsconfig.json`** – TypeScript configuration
- **`prisma/schema.prisma`** – Database schema definition
- **`vitest.config.ts`** – Test runner configuration
- **`.eslintrc.js`** – Linting rules

### Source Directory (`src/`)

#### `app/` – Next.js App Router

```
app/
├── layout.tsx              # Root layout with providers
├── page.tsx                # Home page / landing
├── api/
│   └── trpc/
│       └── [trpc]/route.ts # tRPC HTTP handler
├── auth/
│   ├── login/page.tsx      # Login page
│   └── register/page.tsx   # Registration page (if enabled)
├── dashboard/
│   └── page.tsx            # Main dashboard
├── leads/
│   ├── page.tsx            # Leads list
│   └── [id]/page.tsx       # Lead detail
├── tasks/
│   └── page.tsx            # Tasks page
└── calls/
    └── page.tsx            # Calls/dialer page
```

#### `server/` – Backend Configuration

```
server/
├── trpc.ts                 # tRPC context & procedure definitions
└── api/
    └── root.ts             # Root tRPC router (merges all feature routers)
```

**Key Files:**

**`trpc.ts`** – Defines base procedures and context:
```typescript
export const createTRPCContext = async (opts: { session: Session | null }) => {
  return {
    prisma,
    session: opts.session,
  };
};

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { session: ctx.session } });
});
```

**`api/root.ts`** – Merges feature routers:
```typescript
export const appRouter = createTRPCRouter({
  leads: leadsRouter,
  calls: callsRouter,
  tasks: tasksRouter,
  // Add more feature routers here
});
```

#### `features/` – Feature Modules

Feature folders are organized by domain. Each feature is self-contained with its components, hooks, server logic, and database operations.

```
features/
├── leads/
│   ├── components/
│   │   ├── LeadsList.tsx
│   │   ├── LeadsList.test.tsx
│   │   ├── LeadForm.tsx
│   │   └── LeadCard.tsx
│   ├── hooks/
│   │   ├── useLeads.ts
│   │   └── useLeadForm.ts
│   ├── types/
│   │   └── lead.ts
│   └── server/
│       ├── router.ts        # tRPC procedures
│       ├── schemas.ts       # Zod validation schemas
│       └── services/
│           └── leadService.ts
├── calls/
│   ├── components/
│   ├── hooks/
│   └── server/
│       ├── router.ts
│       └── services/
│           └── twilioService.ts
└── tasks/
    ├── components/
    ├── hooks/
    └── server/
        ├── router.ts
        └── services/
            └── taskService.ts
```

#### `components/` – Shared Components

```
components/
├── layout/
│   ├── DashboardLayout.tsx  # Main layout wrapper
│   ├── Sidebar.tsx          # Navigation sidebar
│   └── Header.tsx           # Top header bar
├── ui/                      # Shadcn/UI components
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Table.tsx
│   └── ...
└── shared/
    ├── Toaster.tsx          # Toast notifications
    ├── Modal.tsx
    └── LoadingSpinner.tsx
```

#### `lib/` – Utilities

```
lib/
├── auth.ts                  # NextAuth configuration
├── utils.ts                 # General utility functions
├── constants.ts             # App-wide constants
└── validators.ts            # Common validation schemas
```

#### `test/` – Testing Configuration

```
test/
└── setup.ts                 # Vitest and testing library setup
```

## Data Flow

### Query (Read) Flow

```
Client Component
    ↓
trpc.leads.getLeads.useQuery()
    ↓
GET /api/trpc?batch=1&input=...
    ↓
tRPC Handler → Finds procedure "leads.getLeads"
    ↓
leadsRouter.getLeads.query() → Called with validated input
    ↓
ctx.prisma.lead.findMany() → Database query
    ↓
Filter by ctx.session.user.organizationId
    ↓
Return typed results to client
    ↓
React component re-renders with fresh data
```

### Mutation (Write) Flow

```
Client Component
    ↓
trpc.leads.createLead.useMutation()
    ↓
mutation.mutate({ name: "...", email: "..." })
    ↓
POST /api/trpc
    ↓
Input validated against Zod schema
    ↓
Authorization check (protectedProcedure)
    ↓
leadsRouter.createLead.mutation() → Business logic
    ↓
ctx.prisma.lead.create()
    ↓
Database insert
    ↓
Return created lead to client
    ↓
Cache updated → UI updates
```

## Key Architectural Patterns

### 1. Feature-Based Modular Architecture

Each feature is self-contained with:
- UI Components (`.tsx`)
- Custom Hooks (`useFeature.ts`)
- tRPC Router (`server/router.ts`)
- Validation Schemas (`server/schemas.ts`)
- Business Logic (`server/services/`)
- Types (`types/`)
- Tests (co-located `.test.tsx`)

**Benefits:**
- Easy to locate related code
- Features can be developed independently
- Simpler to add/remove features
- Promotes code reusability

### 2. tRPC for Type-Safe APIs

tRPC eliminates the need for REST endpoints and DTOs. The server router is automatically type-checked on the client.

```typescript
// Server: Define procedure
export const leadsRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.prisma.lead.findUnique({...}))
});

// Client: Full type safety, auto-complete
const { data } = trpc.leads.getById.useQuery({ id: "123" });
// data is typed as Lead | undefined automatically
```

### 3. Zod Input Validation

All inputs are validated with Zod schemas before reaching business logic.

```typescript
const createLeadSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().optional(),
});

export const createLead = protectedProcedure
  .input(createLeadSchema)
  .mutation(async ({ ctx, input }) => {
    // input is already typed and validated
    return ctx.prisma.lead.create({ data: input });
  });
```

### 4. Multi-Tenancy Enforcement

Every model that needs tenant isolation includes `organizationId`. All queries automatically filter by the user's organization.

```typescript
// Database schema
model Lead {
  id String @id @default(cuid())
  organizationId String
  name String
  email String
  organization Organization @relation(fields: [organizationId], references: [id])
  @@unique([organizationId, email])
}

// tRPC procedure
const getLeads = protectedProcedure.query(async ({ ctx }) => {
  return ctx.prisma.lead.findMany({
    where: {
      organizationId: ctx.session.user.organizationId, // Always filter
    },
  });
});
```

### 5. Protected Procedures

Authentication is enforced at the procedure level. Only `protectedProcedure` handlers have access to the session.

```typescript
export const protectedProcedure = publicProcedure
  .use(async ({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        ...ctx,
        session: ctx.session, // Now guaranteed to exist
      },
    });
  });
```

### 6. Service Layer

Complex business logic is extracted into service classes for reusability and testability.

```typescript
// features/leads/server/services/leadService.ts
export class LeadService {
  constructor(private prisma: PrismaClient) {}

  async createLead(data: CreateLeadInput, organizationId: string) {
    return this.prisma.lead.create({
      data: { ...data, organizationId },
    });
  }

  async updateLeadStatus(leadId: string, status: LeadStatus) {
    // Complex logic here
  }
}

// Usage in router
const leadService = new LeadService(ctx.prisma);
return leadService.createLead(input, ctx.session.user.organizationId);
```

## Database Schema

The Prisma schema defines the data model. Key patterns:

```prisma
model Organization {
  id String @id @default(cuid())
  name String
  users User[]
  leads Lead[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model User {
  id String @id @default(cuid())
  email String @unique
  organizationId String
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  role Role @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Lead {
  id String @id @default(cuid())
  organizationId String
  name String
  email String @unique
  phone String?
  status LeadStatus @default(NEW)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  activities Activity[]
  calls CallLog[]
  tasks Task[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([organizationId])
  @@index([email])
  @@unique([organizationId, email])
}
```

**Patterns:**
- All entities include `createdAt` and `updatedAt` for audit trails
- Multi-tenant data includes `organizationId` with `@@index`
- Unique constraints include `organizationId` to allow same email in different orgs
- `onDelete: Cascade` ensures referential integrity

## Adding a New Feature

### Step 1: Define the Router

Create `src/features/newfeature/server/router.ts`:

```typescript
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import { z } from "zod";

export const newFeatureRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.newModel.findMany({
      where: { organizationId: ctx.session.user.organizationId },
    });
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.newModel.create({
        data: {
          ...input,
          organizationId: ctx.session.user.organizationId,
        },
      });
    }),
});
```

### Step 2: Register in Root Router

Update `src/server/api/root.ts`:

```typescript
export const appRouter = createTRPCRouter({
  leads: leadsRouter,
  newFeature: newFeatureRouter, // Add this
});
```

### Step 3: Create Components

Create `src/features/newfeature/components/` with React components.

### Step 4: Use in Pages

In your page component:

```typescript
import { trpc } from "@/app/_trpc/client";

export default function NewFeaturePage() {
  const { data } = trpc.newFeature.getAll.useQuery();
  const createMutation = trpc.newFeature.create.useMutation();

  return (
    <DashboardLayout>
      {/* Your UI here */}
    </DashboardLayout>
  );
}
```

## Testing Strategy

### Unit Tests

Test individual functions and components in isolation:

```typescript
describe("LeadService", () => {
  it("creates a lead with organizationId", () => {
    const service = new LeadService(mockPrisma);
    const result = service.createLead({ name: "Test" }, "org-1");
    expect(result.organizationId).toBe("org-1");
  });
});
```

### Component Tests

Test React components with React Testing Library:

```typescript
describe("LeadForm", () => {
  it("submits form with valid input", () => {
    render(<LeadForm onSubmit={mockSubmit} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "John" } });
    fireEvent.click(screen.getByText("Submit"));
    expect(mockSubmit).toHaveBeenCalled();
  });
});
```

### Integration Tests

Test tRPC procedures with mocked Prisma:

```typescript
it("getLeads returns only user's organization leads", async () => {
  const caller = appRouter.createCaller({
    session: { user: { organizationId: "org-1" } },
    prisma: mockPrisma,
  });
  
  const leads = await caller.leads.getAll();
  expect(leads).toHaveLength(2);
  expect(leads.every(l => l.organizationId === "org-1")).toBe(true);
});
```

## Performance Considerations

- **Database Indexes**: Ensure all frequently queried fields are indexed
- **Query Optimization**: Use Prisma `select` to fetch only needed fields
- **Caching**: React Query handles client-side caching automatically
- **Pagination**: Implement for large datasets
- **Database Connection Pooling**: Configure in `.env.local` for production

## Security Considerations

1. **Input Validation**: All inputs validated with Zod
2. **Authorization**: All procedures check `ctx.session`
3. **Tenant Isolation**: All queries filter by `organizationId`
4. **No Secrets in Code**: Use environment variables
5. **SQL Injection Prevention**: Prisma parameterizes queries
6. **CSRF Protection**: Built into Next.js by default

## Deployment Considerations

- Use environment-specific `.env.local` files
- Run `npx prisma db push` before starting application
- Enable proper logging and monitoring
- Use production-grade database (not SQLite)
- Configure session secret with secure random value
- Enable HTTPS in production

## Further Reading

- [Next.js Documentation](https://nextjs.org/docs)
- [tRPC Documentation](https://trpc.io)
- [Prisma Documentation](https://www.prisma.io/docs)
- [NextAuth.js Documentation](https://next-auth.js.org)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
