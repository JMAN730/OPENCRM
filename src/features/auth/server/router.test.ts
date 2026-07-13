import { describe, it, expect, vi } from "vitest";
import { createTestCaller } from "@/test/trpc";

vi.mock("@/lib/email", () => ({ sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/features/billing/server/stripe", () => ({
  createStripeCustomer: vi.fn().mockResolvedValue("cus_test"),
}));

describe("authRouter.resetPassword", () => {
  it("always returns success without revealing whether the email exists", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await caller.auth.resetPassword({ email: "anyone@example.com" });

    expect(result).toEqual({ success: true });
  });

  it("returns success even when the user exists (no enumeration)", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "user@example.com" });
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.create.mockResolvedValue({});

    const result = await caller.auth.resetPassword({ email: "user@example.com" });

    expect(result).toEqual({ success: true });
  });

  it("creates a hashed reset token when the user exists (raw value never stored)", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "user@example.com" });
    prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.create.mockResolvedValue({});

    await caller.auth.resetPassword({ email: "user@example.com" });

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
    const createArgs = prisma.passwordResetToken.create.mock.calls[0][0];
    expect(createArgs.data.userId).toBe("u-1");
    // tokenHash is SHA-256 hex (64 chars)
    expect(createArgs.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createArgs.data).not.toHaveProperty("token");
  });

  it("does not create a token when the user does not exist", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);

    await caller.auth.resetPassword({ email: "ghost@example.com" });

    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("rejects malformed emails (zod validation)", async () => {
    const { caller } = createTestCaller({ session: null });
    await expect(caller.auth.resetPassword({ email: "not-an-email" })).rejects.toThrow();
  });

  it("works without an authenticated session (publicProcedure)", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(caller.auth.resetPassword({ email: "x@y.com" })).resolves.toEqual({
      success: true,
    });
  });
});

describe("authRouter.confirmResetPassword", () => {
  it("rejects an invalid token", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(
      caller.auth.confirmResetPassword({ token: "bad-token", password: "newpassword" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("looks up the token by sha256 hash, never by raw value", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(
      caller.auth.confirmResetPassword({ token: "raw-token-input", password: "newpassword" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const findArgs = prisma.passwordResetToken.findUnique.mock.calls[0][0];
    // SHA-256 hex of "raw-token-input"
    expect(findArgs.where.tokenHash).toBe(
      "354a6376afb5e2848d94fb051a99ef87be902a77163de23a80b4d1b733880d35",
    );
    expect(findArgs.where).not.toHaveProperty("token");
  });

  it("rejects an expired token", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      tokenHash: "h",
      userId: "u-1",
      expires: new Date(Date.now() - 1000), // already expired
    });

    await expect(
      caller.auth.confirmResetPassword({ token: "tok", password: "newpassword" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("updates the password and consumes the token atomically on success", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      tokenHash: "h",
      userId: "u-1",
      expires: new Date(Date.now() + 60_000),
    });
    prisma.user.update.mockResolvedValue({ id: "u-1" });
    prisma.passwordResetToken.delete.mockResolvedValue({});
    prisma.$transaction.mockResolvedValue([{ id: "u-1" }, {}]);

    const result = await caller.auth.confirmResetPassword({
      token: "valid-token",
      password: "newpassword",
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.$transaction).toHaveBeenCalled();
    // Password should be hashed before being passed to user.update
    const txCalls = prisma.$transaction.mock.calls[0][0] as unknown[];
    expect(txCalls.length).toBe(2);
  });

  it("rejects passwords shorter than 8 chars", async () => {
    const { caller } = createTestCaller({ session: null });
    await expect(
      caller.auth.confirmResetPassword({ token: "tok", password: "short" })
    ).rejects.toThrow();
  });

  it("works without an authenticated session (publicProcedure)", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(
      caller.auth.confirmResetPassword({ token: "x", password: "password123" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("authRouter.updateProfile", () => {
  it("rejects unauthenticated callers", async () => {
    const { caller } = createTestCaller({ session: null });
    await expect(caller.auth.updateProfile({ name: "New Name" })).rejects.toThrow();
  });

  it("rejects when neither name nor email is provided", async () => {
    const { caller } = createTestCaller();
    await expect(caller.auth.updateProfile({} as never)).rejects.toThrow();
  });

  it("updates name when only name is provided", async () => {
    const { caller, prisma } = createTestCaller();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({ id: "user-1" });

    const result = await caller.auth.updateProfile({ name: "New Name" });

    expect(result).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "New Name" },
    });
  });

  it("normalizes email to lowercase and checks for conflicts", async () => {
    const { caller, prisma } = createTestCaller();
    const bcrypt = await import("bcryptjs");
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      password: await bcrypt.hash("correct-password", 1),
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({ id: "user-1" });

    await caller.auth.updateProfile({ email: "NEW@Example.COM", currentPassword: "correct-password" });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "new@example.com", NOT: { id: "user-1" } },
    });
    expect(prisma.user.update.mock.calls[0][0].data.email).toBe("new@example.com");
  });

  it("throws CONFLICT when new email is already taken by another user", async () => {
    const { caller, prisma } = createTestCaller();
    const bcrypt = await import("bcryptjs");
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      password: await bcrypt.hash("correct-password", 1),
    });
    prisma.user.findFirst.mockResolvedValue({ id: "other-user", email: "taken@example.com" });

    await expect(
      caller.auth.updateProfile({ email: "taken@example.com", currentPassword: "correct-password" })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("trims whitespace from name", async () => {
    const { caller, prisma } = createTestCaller();
    prisma.user.update.mockResolvedValue({ id: "user-1" });

    await caller.auth.updateProfile({ name: "  Alice  " });

    expect(prisma.user.update.mock.calls[0][0].data.name).toBe("Alice");
  });

  it("updates the loading animation preference", async () => {
    const { caller, prisma } = createTestCaller();
    prisma.user.update.mockResolvedValue({ id: "user-1" });

    await expect(caller.auth.updateProfile({ loadingAnimationMode: "ONCE_DAILY" })).resolves.toEqual({ ok: true });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { loadingAnimationMode: "ONCE_DAILY" },
    });
  });

  it("rejects invalid loading animation preferences", async () => {
    const { caller } = createTestCaller();
    await expect(caller.auth.updateProfile({ loadingAnimationMode: "SOMETIMES" } as never)).rejects.toThrow();
  });

  it("rejects malformed email", async () => {
    const { caller } = createTestCaller();
    await expect(caller.auth.updateProfile({ email: "not-an-email" })).rejects.toThrow();
  });

  it("rejects email change when currentPassword is missing", async () => {
    const { caller } = createTestCaller();
    await expect(
      caller.auth.updateProfile({ email: "new@example.com" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects email change when currentPassword is wrong", async () => {
    const { caller, prisma } = createTestCaller();
    const bcrypt = await import("bcryptjs");
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      password: await bcrypt.hash("correct-password", 1),
    });

    await expect(
      caller.auth.updateProfile({
        email: "new@example.com",
        currentPassword: "wrong-password",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("allows email change when currentPassword matches", async () => {
    const { caller, prisma } = createTestCaller();
    const bcrypt = await import("bcryptjs");
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      password: await bcrypt.hash("correct-password", 1),
    });
    prisma.user.findFirst.mockResolvedValue(null); // no email conflict
    prisma.user.update.mockResolvedValue({});

    await caller.auth.updateProfile({
      email: "new@example.com",
      currentPassword: "correct-password",
    });

    expect(prisma.user.update).toHaveBeenCalled();
  });
});

describe("authRouter.register", () => {
  const validInput = {
    name: "Alice",
    email: "alice@example.com",
    password: "supersecret",
    organizationName: "Acme",
  };

  it("rejects missing name", async () => {
    const { caller } = createTestCaller({ session: null });
    await expect(
      caller.auth.register({ ...validInput, name: "" })
    ).rejects.toThrow();
  });

  it("rejects malformed emails", async () => {
    const { caller } = createTestCaller({ session: null });
    await expect(
      caller.auth.register({ ...validInput, email: "nope" })
    ).rejects.toThrow();
  });

  it("rejects passwords shorter than 8 chars", async () => {
    const { caller } = createTestCaller({ session: null });
    await expect(
      caller.auth.register({ ...validInput, password: "short" })
    ).rejects.toThrow();
  });

  it("returns CONFLICT when email already exists", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue({ id: "existing", email: "alice@example.com" });

    await expect(caller.auth.register(validInput)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it("returns CONFLICT when another registration wins the email race", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue({ code: "P2002" });

    await expect(caller.auth.register(validInput)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "An account with that email already exists.",
    });
  });

  it("hashes the password before storing", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({ id: "org-1", name: "Acme" });
    prisma.user.create.mockResolvedValue({ id: "u-1" });

    await caller.auth.register(validInput);

    const passwordStored = prisma.user.create.mock.calls[0][0].data.password;
    expect(passwordStored).not.toBe(validInput.password);
    expect(passwordStored).toMatch(/^\$2[aby]\$/);
  });

  it("normalizes email to lowercase before storing/checking", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({ id: "org-1", name: "Acme" });
    prisma.user.create.mockResolvedValue({ id: "u-1" });

    await caller.auth.register({ ...validInput, email: "Alice@Example.COM" });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
    });
    expect(prisma.user.create.mock.calls[0][0].data.email).toBe("alice@example.com");
  });

  it("uses a default organization name when none provided", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({ id: "org-1", name: "Alice's Organization" });
    prisma.user.create.mockResolvedValue({ id: "u-1" });

    await caller.auth.register({ ...validInput, organizationName: undefined });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization: {
            create: expect.objectContaining({
              name: "Alice's Organization",
              subscription: expect.objectContaining({
                create: expect.objectContaining({
                  planTier: "STARTER",
                  status: "TRIALING",
                }),
              }),
            }),
          },
        }),
      })
    );
  });

  it("trims provided organizationName", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({ id: "org-1", name: "Acme" });
    prisma.user.create.mockResolvedValue({ id: "u-1" });

    await caller.auth.register({ ...validInput, organizationName: "  Acme  " });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization: {
            create: expect.objectContaining({
              name: "Acme",
              subscription: expect.objectContaining({
                create: expect.objectContaining({ planTier: "STARTER" }),
              }),
            }),
          },
        }),
      })
    );
  });

  it("falls back to default org name when organizationName is whitespace-only", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({ id: "org-1", name: "Alice's Organization" });
    prisma.user.create.mockResolvedValue({ id: "u-1" });

    await caller.auth.register({ ...validInput, organizationName: "   " });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization: {
            create: expect.objectContaining({
              name: "Alice's Organization",
              subscription: expect.objectContaining({
                create: expect.objectContaining({
                  planTier: "STARTER",
                  status: "TRIALING",
                }),
              }),
            }),
          },
        }),
      })
    );
  });

  it("creates user with ADMIN role linked to the new org", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "u-1", organizationId: "org-99" });
    prisma.organizationSubscription.update.mockResolvedValue({});

    await caller.auth.register(validInput);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Alice",
          email: "alice@example.com",
          role: "ADMIN",
          organization: { create: expect.objectContaining({ name: "Acme" }) },
        }),
      })
    );
    expect(prisma.organizationSubscription.update).toHaveBeenCalledWith({
      where: { organizationId: "org-99" },
      data: { stripeCustomerId: "cus_test" },
    });
  });
});
