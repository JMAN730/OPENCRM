import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

// Build an absolute, forward-slash URL so @libsql/client works on Windows.
// PrismaLibSql is a factory — it takes a config object, not a pre-created client.
const dbAbsPath = path
  .resolve(process.cwd(), "prisma", "dev.db")
  .replace(/\\/g, "/");
const DB_URL = `file:///${dbAbsPath}`;

const adapter = new PrismaLibSql({ url: DB_URL });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter, log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
