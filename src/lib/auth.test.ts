import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { authOptions } from "./auth";
import bcrypt from "bcryptjs";

// authOptions.callbacks should always be defined; capture them with non-null assertions.
const sessionCallback = authOptions.callbacks!.session!;
const jwtCallback = authOptions.callbacks!.jwt!;

describe("authOptions.session strategy", () => {
  it("uses JWTs", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
  });

  it("expires sessions after 30 days", () => {
    expect(authOptions.session?.maxAge).toBe(30 * 24 * 60 * 60);
  });

  it("redirects unauthenticated users to /auth/signin", () => {
    expect(authOptions.pages?.signIn).toBe("/auth/signin");
  });
});

describe("session callback", () => {
  it("attaches id, role, organizationId from the token", async () => {
    const result = await sessionCallback({
      session: { user: { name: "X", email: "x@y.com", image: null }, expires: "" },
      token: { id: "u1", role: "ADMIN", organizationId: "org-1" },
      // unused params, satisfy types
    } as never);

    expect((result.user as { id: string }).id).toBe("u1");
    expect((result.user as { role: string }).role).toBe("ADMIN");
    expect((result.user as { organizationId: string }).organizationId).toBe("org-1");
  });

  it("does not throw if session.user is missing", async () => {
    const result = await sessionCallback({
      session: { expires: "" },
      token: { id: "u1" },
    } as never);
    expect(result).toBeDefined();
  });
});

describe("jwt callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates token with id/role/organizationId from DB on first sign-in", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "u1",
      role: "ADMIN",
      organizationId: "org-1",
    });

    const token = await jwtCallback({
      token: {},
      user: { email: "x@y.com" },
    } as never);

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "x@y.com" },
    });
    expect(token).toMatchObject({ id: "u1", role: "ADMIN", organizationId: "org-1" });
  });

  it("does not query the DB on subsequent calls (no user in args)", async () => {
    const token = await jwtCallback({
      token: { id: "u1", role: "ADMIN", organizationId: "org-1" },
    } as never);

    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(token).toMatchObject({ id: "u1" });
  });

  it("swallows DB errors so login isn't blocked entirely (best-effort hydration)", async () => {
    mockPrisma.user.findFirst.mockRejectedValue(new Error("db down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const token = await jwtCallback({
      token: {},
      user: { email: "x@y.com" },
    } as never);

    expect(token).toBeDefined(); // doesn't throw
    consoleSpy.mockRestore();
  });
});

describe("Credentials provider authorize()", () => {
  // next-auth's CredentialsProvider stores the user-defined authorize() on
  // `provider.options.authorize` — the top-level `authorize` is a stub.
  const credentialsProvider = (authOptions.providers as Array<{ id?: string; options?: unknown }>).find(
    (p) => p.id === "credentials"
  );
  const authorize = (credentialsProvider!.options as { authorize: (creds: unknown) => Promise<unknown> })
    .authorize;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when credentials are missing", async () => {
    expect(await authorize({})).toBeNull();
    expect(await authorize({ email: "x@y.com" })).toBeNull();
    expect(await authorize({ password: "p" })).toBeNull();
  });

  it("returns null when the user does not exist", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    expect(await authorize({ email: "x@y.com", password: "p" })).toBeNull();
  });

  it("returns null when the user has no password (e.g. OAuth-only account)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u1", password: null });
    expect(await authorize({ email: "x@y.com", password: "p" })).toBeNull();
  });

  it("returns null when the password does not match", async () => {
    const hashed = await bcrypt.hash("right-password", 4);
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "u1",
      email: "x@y.com",
      password: hashed,
    });

    expect(await authorize({ email: "x@y.com", password: "wrong-password" })).toBeNull();
  });

  it("returns the user when credentials are correct", async () => {
    const hashed = await bcrypt.hash("right-password", 4);
    const dbUser = {
      id: "u1",
      email: "x@y.com",
      password: hashed,
      role: "ADMIN",
      organizationId: "org-1",
    };
    mockPrisma.user.findFirst.mockResolvedValue(dbUser);

    const result = await authorize({ email: "x@y.com", password: "right-password" });
    expect(result).toEqual(dbUser);
  });
});
