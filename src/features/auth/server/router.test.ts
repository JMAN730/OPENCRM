import { describe, it, expect } from "vitest";
import { createTestCaller } from "@/test/trpc";

describe("authRouter.resetPassword", () => {
  it("always returns success without revealing whether the email exists", async () => {
    const { caller, prisma } = createTestCaller({ session: null });

    // Should NOT touch the database — never queries the user table
    const result = await caller.auth.resetPassword({ email: "anyone@example.com" });

    expect(result).toEqual({ success: true });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("rejects malformed emails (zod validation)", async () => {
    const { caller } = createTestCaller({ session: null });
    await expect(caller.auth.resetPassword({ email: "not-an-email" })).rejects.toThrow();
  });

  it("works without an authenticated session (publicProcedure)", async () => {
    const { caller } = createTestCaller({ session: null });
    await expect(caller.auth.resetPassword({ email: "x@y.com" })).resolves.toEqual({
      success: true,
    });
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

    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: { name: "Alice's Organization" },
    });
  });

  it("trims provided organizationName", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({ id: "org-1", name: "Acme" });
    prisma.user.create.mockResolvedValue({ id: "u-1" });

    await caller.auth.register({ ...validInput, organizationName: "  Acme  " });

    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: { name: "Acme" },
    });
  });

  it("falls back to default org name when organizationName is whitespace-only", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({ id: "org-1", name: "Alice's Organization" });
    prisma.user.create.mockResolvedValue({ id: "u-1" });

    await caller.auth.register({ ...validInput, organizationName: "   " });

    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: { name: "Alice's Organization" },
    });
  });

  it("creates user with ADMIN role linked to the new org", async () => {
    const { caller, prisma } = createTestCaller({ session: null });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({ id: "org-99", name: "Acme" });
    prisma.user.create.mockResolvedValue({ id: "u-1" });

    await caller.auth.register(validInput);

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Alice",
        email: "alice@example.com",
        organizationId: "org-99",
        role: "ADMIN",
      }),
    });
  });
});
