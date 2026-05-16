import { existsSync, readFileSync } from "node:fs";

function envValue(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env")) return undefined;

  const match = readFileSync(".env", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
  return match?.[1]?.trim().replace(/^"|"$/g, "");
}

const prismaConfig = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: envValue("DATABASE_URL") ?? "postgresql://crm:crm@localhost:5432/crm",
  },
};

export default prismaConfig;
