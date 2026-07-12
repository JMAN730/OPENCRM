import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma, mockProvision } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
  mockProvision: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/features/auth/server/provision", () => ({
  provisionUserWithOrganization: mockProvision,
}));

import { authOptions } from "./auth";
import bcrypt from "bcryptjs";

beforeEach(() => {
  vi.clearAllMocks();
});

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
  it("attaches id, role, organizationId, and loadingAnimationMode from the token", async () => {
    const result = await sessionCallback({
      session: { user: { name: "X", email: "x@y.com", image: null }, expires: "" },
      token: { id: "u1", role: "ADMIN", organizationId: "org-1", loadingAnimationMode: "OFF" },
      // unused params, satisfy types
    } as never);

    expect((result.user as { id: string }).id).toBe("u1");
    expect((result.user as { role: string }).role).toBe("ADMIN");
    expect((result.user as { organizationId: string }).organizationId).toBe("org-1");
    expect((result.user as { loadingAnimationMode: string }).loadingAnimationMode).toBe("OFF");
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
  it("hydrates token with id/role/organizationId from DB on first sign-in", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      name: "Fresh User",
      email: "x@y.com",
      role: "ADMIN",
      organizationId: "org-1",
      teamId: null,
      loadingAnimationMode: "ONCE_DAILY",
    });

    const token = await jwtCallback({
      token: {},
      user: { email: "x@y.com" },
    } as never);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "x@y.com" },
      select: { id: true, name: true, email: true, role: true, isSuperAdmin: true, organizationId: true, teamId: true, loadingAnimationMode: true, sessionVersion: true },
    });
    expect(token).toMatchObject({
      id: "u1",
      name: "Fresh User",
      role: "ADMIN",
      organizationId: "org-1",
      loadingAnimationMode: "ONCE_DAILY",
    });
  });

  it("normalizes the email to lowercase before looking up the user", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      name: "Fresh User",
      email: "x@y.com",
      role: "ADMIN",
      organizationId: "org-1",
      teamId: null,
      loadingAnimationMode: "ALWAYS",
    });

    await jwtCallback({
      token: {},
      user: { email: "X@Y.COM" },
    } as never);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "x@y.com" } }),
    );
  });

  it("re-fetches the user on subsequent refreshes so profile and role/org changes take effect", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      name: "Updated Name",
      email: "x@y.com",
      role: "MANAGER",
      organizationId: "org-2",
      teamId: null,
      loadingAnimationMode: "OFF",
    });

    const token = await jwtCallback({
      token: { id: "u1", role: "ADMIN", organizationId: "org-1", teamId: null },
    } as never);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { id: true, name: true, email: true, role: true, isSuperAdmin: true, organizationId: true, teamId: true, loadingAnimationMode: true, sessionVersion: true },
    });
    expect(token).toMatchObject({
      name: "Updated Name",
      role: "MANAGER",
      organizationId: "org-2",
      loadingAnimationMode: "OFF",
    });
  });

  it("revokes the session when sessionVersion changed after the token was minted (CWE-613)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      name: "X",
      email: "x@y.com",
      role: "ADMIN",
      organizationId: "org-1",
      teamId: null,
      loadingAnimationMode: "ALWAYS",
      sessionVersion: 2,
    });

    const token = await jwtCallback({
      token: { id: "u1", role: "ADMIN", organizationId: "org-1", teamId: null, sessionVersion: 1 },
    } as never);

    expect(token).toEqual({});
  });

  it("keeps the session when sessionVersion still matches", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      name: "X",
      email: "x@y.com",
      role: "ADMIN",
      organizationId: "org-1",
      teamId: null,
      loadingAnimationMode: "ALWAYS",
      sessionVersion: 3,
    });

    const token = await jwtCallback({
      token: { id: "u1", role: "ADMIN", organizationId: "org-1", teamId: null, sessionVersion: 3 },
    } as never);

    expect(token).toMatchObject({ id: "u1", role: "ADMIN", sessionVersion: 3 });
  });

  it("does not revoke a legacy token that predates sessionVersion (adopts current version)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "u1",
      name: "X",
      email: "x@y.com",
      role: "ADMIN",
      organizationId: "org-1",
      teamId: null,
      loadingAnimationMode: "ALWAYS",
      sessionVersion: 5,
    });

    const token = await jwtCallback({
      token: { id: "u1", role: "ADMIN", organizationId: "org-1", teamId: null },
    } as never);

    expect(token).toMatchObject({ id: "u1", sessionVersion: 5 });
  });

  it("returns an empty token when the user no longer exists (ghost session)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const token = await jwtCallback({
      token: { id: "deleted-user", role: "ADMIN", organizationId: "org-1", teamId: null },
    } as never);

    expect(token).toEqual({});
  });

  it("keeps the existing token if DB lookup throws on refresh (soft-fail)", async () => {
    mockPrisma.user.findUnique.mockRejectedValueOnce(new Error("db down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const token = await jwtCallback({
      token: { id: "u1", role: "ADMIN", organizationId: "org-1", teamId: null },
    } as never);

    expect(token).toMatchObject({ id: "u1", role: "ADMIN" });
    consoleSpy.mockRestore();
  });

  it("swallows DB errors on first sign-in so a transient failure doesn't block login", async () => {
    mockPrisma.user.findUnique.mockRejectedValueOnce(new Error("db down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const token = await jwtCallback({
      token: {},
      user: { email: "x@y.com" },
    } as never);

    expect(token).toBeDefined(); // doesn't throw
    consoleSpy.mockRestore();
  });
});

describe("signIn callback (Google OAuth)", () => {
  const signInCallback = authOptions.callbacks!.signIn!;

  it("allows non-Google providers through without provisioning", async () => {
    const result = await signInCallback({
      user: { id: "u1", email: "x@y.com" },
      account: { provider: "credentials" },
    } as never);

    expect(result).toBe(true);
    expect(mockProvision).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects Google sign-in when the email is not verified", async () => {
    const result = await signInCallback({
      user: { id: "g1", email: "x@y.com", name: "X" },
      account: { provider: "google" },
      profile: { email_verified: false },
    } as never);

    expect(result).toBe(false);
    expect(mockProvision).not.toHaveBeenCalled();
  });

  it("rejects Google sign-in when the profile has no email", async () => {
    const result = await signInCallback({
      user: { id: "g1", email: null, name: "X" },
      account: { provider: "google" },
      profile: { email_verified: true },
    } as never);

    expect(result).toBe(false);
    expect(mockProvision).not.toHaveBeenCalled();
  });

  it("allows an existing user to sign in with Google without re-provisioning", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1", email: "x@y.com" });

    const result = await signInCallback({
      user: { id: "g1", email: "X@Y.COM", name: "X" },
      account: { provider: "google" },
      profile: { email_verified: true },
    } as never);

    expect(result).toBe(true);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "x@y.com" },
    });
    expect(mockProvision).not.toHaveBeenCalled();
  });

  it("provisions an organization and user for a first-time Google sign-in", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockProvision.mockResolvedValueOnce({ userId: "u-new" });

    const result = await signInCallback({
      user: { id: "g1", email: "New@Y.com", name: "New User" },
      account: { provider: "google" },
      profile: { email_verified: true },
    } as never);

    expect(result).toBe(true);
    expect(mockProvision).toHaveBeenCalledWith({
      prisma: mockPrisma,
      name: "New User",
      email: "new@y.com",
    });
  });

  it("falls back to the email as the name when Google returns no name", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockProvision.mockResolvedValueOnce({ userId: "u-new" });

    await signInCallback({
      user: { id: "g1", email: "new@y.com", name: null },
      account: { provider: "google" },
      profile: { email_verified: true },
    } as never);

    expect(mockProvision).toHaveBeenCalledWith({
      prisma: mockPrisma,
      name: "new@y.com",
      email: "new@y.com",
    });
  });

  it("denies sign-in (does not throw) when provisioning fails", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockProvision.mockRejectedValueOnce(new Error("db down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await signInCallback({
      user: { id: "g1", email: "new@y.com", name: "New User" },
      account: { provider: "google" },
      profile: { email_verified: true },
    } as never);

    expect(result).toBe(false);
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

  it("returns null when credentials are missing", async () => {
    expect(await authorize({})).toBeNull();
    expect(await authorize({ email: "x@y.com" })).toBeNull();
    expect(await authorize({ password: "p" })).toBeNull();
  });

  it("returns null when the user does not exist (constant-time bcrypt still runs)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    expect(await authorize({ email: "x@y.com", password: "p" })).toBeNull();
  });

  it("looks up users by email only (no name fallback)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    await authorize({ email: "X@Y.COM", password: "p" });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "x@y.com" },
    });
  });

  it("returns null when the user has no password (e.g. OAuth-only account)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1", password: null });
    expect(await authorize({ email: "x@y.com", password: "p" })).toBeNull();
  });

  it("returns null when the password does not match", async () => {
    const hashed = await bcrypt.hash("right-password", 4);
    mockPrisma.user.findUnique.mockResolvedValueOnce({
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
    mockPrisma.user.findUnique.mockResolvedValueOnce(dbUser);

    const result = await authorize({ email: "x@y.com", password: "right-password" });
    expect(result).toEqual(dbUser);
  });
});
