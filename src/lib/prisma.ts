import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

// Resolve the database URL. In production (Tauri desktop), DATABASE_URL is set
// by Rust to the user's AppData path (always an absolute path).
// In dev it is a relative path — we fall through to the static default below.
// @libsql/client requires a file:/// URI with forward slashes on Windows.
function resolveDbUrl(): string {
  const env = process.env.DATABASE_URL;
  if (env) {
    // Already a proper absolute file URI
    if (env.startsWith("file:///")) return env;
    if (env.startsWith("file:")) {
      const raw = env.slice(5).replace(/\\/g, "/");
      // Windows absolute path e.g. "file:C:\..." → "file:///C:/..."
      if (/^[a-zA-Z]:/.test(raw)) return `file:///${raw}`;
      // Unix absolute path e.g. "file:/home/..."
      if (raw.startsWith("/")) return `file://${raw}`;
      // Relative path — fall through to static default
    }
  }
  // Static fallback: dev.db next to the server root.
  // This string is statically known so Turbopack/NFT won't over-trace.
  const abs = path.resolve(process.cwd(), "prisma", "dev.db").replace(/\\/g, "/");
  return `file:///${abs}`;
}

const DB_URL = resolveDbUrl();

const adapter = new PrismaLibSql({ url: DB_URL });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter, log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
