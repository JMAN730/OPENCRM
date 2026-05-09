import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    organization: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

// Import AFTER the mock is set up
import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(makeRequest({ email: "a@b.com", password: "secret" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Name, email and password are required.",
    });
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({ name: "A", password: "secret" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makeRequest({ name: "A", email: "a@b.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when an account with that email already exists", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "existing", email: "a@b.com" });

    const res = await POST(makeRequest({ name: "A", email: "a@b.com", password: "x" }));

    expect(res.status).toBe(409);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.organization.create).not.toHaveBeenCalled();
  });

  it("hashes the password before storing it", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValue({ id: "org-1", name: "X" });
    mockPrisma.user.create.mockResolvedValue({ id: "u1" });

    const res = await POST(
      makeRequest({ name: "Alice", email: "a@b.com", password: "plaintext-password" })
    );

    expect(res.status).toBe(201);
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    const passwordStored = mockPrisma.user.create.mock.calls[0][0].data.password;
    expect(passwordStored).not.toBe("plaintext-password");
    // bcrypt hash starts with $2a$, $2b$, or $2y$
    expect(passwordStored).toMatch(/^\$2[aby]\$/);
  });

  it("creates a default organization name from the user's name when none is provided", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValue({ id: "org-1", name: "Alice's Organization" });
    mockPrisma.user.create.mockResolvedValue({ id: "u1" });

    await POST(makeRequest({ name: "Alice", email: "a@b.com", password: "x" }));

    expect(mockPrisma.organization.create).toHaveBeenCalledWith({
      data: { name: "Alice's Organization" },
    });
  });

  it("uses the provided organizationName (trimmed) when present", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValue({ id: "org-1", name: "Acme" });
    mockPrisma.user.create.mockResolvedValue({ id: "u1" });

    await POST(
      makeRequest({
        name: "Alice",
        email: "a@b.com",
        password: "x",
        organizationName: "  Acme  ",
      })
    );

    expect(mockPrisma.organization.create).toHaveBeenCalledWith({
      data: { name: "Acme" },
    });
  });

  it("links the new user to the new organization with role=ADMIN", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValue({ id: "org-99", name: "X" });
    mockPrisma.user.create.mockResolvedValue({ id: "u1" });

    await POST(makeRequest({ name: "Alice", email: "a@b.com", password: "x" }));

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Alice",
        email: "a@b.com",
        organizationId: "org-99",
        role: "ADMIN",
      }),
    });
  });

  it("returns 500 with a generic message if anything throws", async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error("db down"));
    // Suppress the expected console.error noise
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest({ name: "A", email: "a@b.com", password: "x" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    // Must NOT leak internal error messages
    expect(body.error).not.toContain("db down");
    consoleSpy.mockRestore();
  });
});
