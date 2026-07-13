import { vi } from "vitest";
import { appRouter } from "@/server/api/root";

export type MockSessionUser = {
  id: string;
  email: string;
  name: string;
  organizationId: string | null;
  role: string;
  isSuperAdmin: boolean;
};

export function createTestSession(overrides: Partial<MockSessionUser> = {}) {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      name: "Test User",
      organizationId: "org-1",
      role: "ADMIN",
      isSuperAdmin: false,
      image: null,
      ...overrides,
    },
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
  };
}

export function createMockPrisma() {
  return {
    lead: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      createManyAndReturn: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    customOutcome: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    leadTag: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    callLog: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    scraperJob: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
    },
    organization: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    organizationSubscription: {
      groupBy: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({
        planTier: "PRO",
        status: "ACTIVE",
        seatLimit: 10,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      }),
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({
        planTier: "STARTER",
        status: "TRIALING",
        seatLimit: 3,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn().mockResolvedValue({
        planTier: "STARTER",
        status: "TRIALING",
        seatLimit: 3,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      }),
    },
    stripeWebhookEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    invitation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    note: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    passwordResetToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    team: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    activity: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    orgScraperCategory: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    scheduledScrape: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    scoringRule: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    salesScript: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    generatedWebsite: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    emailDraft: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    emailEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    emailOptOut: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    smsDraft: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn(),
    },
    smsEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    phoneOptOut: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    outreachJob: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    pipeline: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    pipelineStage: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    trainingPersona: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    trainingSession: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn().mockImplementation(async (arg: unknown) => {
      // Support both the array form (used by the auth router's reset
      // confirmation) and the function form (callback-style transactions).
      if (Array.isArray(arg)) return Promise.all(arg);
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => unknown)(createMockPrisma());
      }
      return undefined;
    }),
  };
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;

type CallerOptions = {
  prisma?: MockPrisma;
  session?: ReturnType<typeof createTestSession> | null;
  sessionOverrides?: Partial<MockSessionUser>;
};

/**
 * Build a tRPC server-side caller with a mocked Prisma client and synthetic session.
 * Use the returned `prisma` to stub specific Prisma calls and `caller` to invoke procedures.
 */
export function createTestCaller(opts: CallerOptions = {}) {
  const prisma = opts.prisma ?? createMockPrisma();
  const session =
    opts.session === null
      ? null
      : opts.session ?? createTestSession(opts.sessionOverrides);

  const ctx = {
    prisma: prisma as unknown as typeof import("@/lib/prisma").prisma,
    session,
    headers: new Headers(),
  };

  // appRouter.createCaller accepts the raw context object
  const caller = appRouter.createCaller(ctx as never);
  return { caller, prisma, session, ctx };
}
