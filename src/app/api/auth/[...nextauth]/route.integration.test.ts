/**
 * Integration coverage for the REAL `next-auth` package.
 *
 * `route.test.ts` fully mocks next-auth, so it cannot detect whether the
 * installed NextAuth(authOptions) route handler actually resolves the
 * Promise-shaped `context.params` this route forwards (Next.js App Router
 * passes `params` as a Promise; next-auth only awaits it since v4.24.10).
 * This file drives a request through the real handler to pin that contract.
 *
 * Two seams are stubbed to keep the test hermetic:
 * - `@/lib/auth`: the real module instantiates Prisma at import time; the
 *   handler under test only needs a valid NextAuthOptions shape.
 * - `next/headers`: NextAuth's route handler reads headers/cookies through
 *   Next's request-scoped AsyncLocalStorage, which only exists inside a
 *   running Next server. next-auth is externalized by vitest (loaded via
 *   native require), so `vi.mock` can't intercept its internal
 *   `require("next/headers")` — instead we patch the module's plain,
 *   writable CommonJS exports directly and restore them afterwards.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  authOptions: { providers: [], secret: "integration-test-secret" },
}));

type NextHeadersModule = {
  headers: () => Promise<Headers>;
  cookies: () => Promise<{ getAll: () => Array<{ name: string; value: string }> }>;
};

const nodeRequire = createRequire(import.meta.url);
const nextHeaders = nodeRequire("next/headers") as NextHeadersModule;
const realHeaders = nextHeaders.headers;
const realCookies = nextHeaders.cookies;
nextHeaders.headers = async () => new Headers();
nextHeaders.cookies = async () => ({ getAll: () => [] });

afterAll(() => {
  nextHeaders.headers = realHeaders;
  nextHeaders.cookies = realCookies;
});

import { GET } from "./route";

describe("NextAuth route (real next-auth handler)", () => {
  it("resolves the Promise-shaped context.params and dispatches the action", async () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    const request = new NextRequest("http://localhost:3000/api/auth/providers");

    const response = await GET(request, {
      params: Promise.resolve({ nextauth: ["providers"] }),
    });

    // If next-auth did not await `context.params`, the action would come
    // back undefined and the handler would answer 400. A 200 JSON body
    // proves the Promise was resolved and routed to the `providers` action.
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({});
  });

  it("answers 400 when the resolved params carry an unknown action (negative control)", async () => {
    // Proves the 200 above is not unconditional: next-auth only succeeds
    // when it can read a valid action out of the *resolved* params.
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    const request = new NextRequest("http://localhost:3000/api/auth/not-a-real-action");

    const response = await GET(request, {
      params: Promise.resolve({ nextauth: ["not-a-real-action"] }),
    });

    expect(response.status).toBe(400);
  });
});
