import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires an explicit driver adapter. The schema is postgres-only
// (`provider = "postgresql"`), so we always use @prisma/adapter-pg.
//
// During tests / typecheck DATABASE_URL is often unset; we use a harmless
// placeholder so module evaluation succeeds. Tests mock the prisma client
// via `createTestCaller`, so no real connection is ever attempted.
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
