import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma, mockCreateStripeCustomer } = vi.hoisted(() => ({
  mockPrisma: {
    user: { create: vi.fn() },
    organizationSubscription: { update: vi.fn() },
  },
  mockCreateStripeCustomer: vi.fn(),
}));

vi.mock("@/features/billing/server/stripe", () => ({
  createStripeCustomer: mockCreateStripeCustomer,
}));

import { provisionUserWithOrganization } from "./provision";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.create.mockResolvedValue({ id: "u-1", organizationId: "org-1" });
  mockCreateStripeCustomer.mockResolvedValue(null);
});

const prisma = mockPrisma as never;

describe("provisionUserWithOrganization", () => {
  it("atomically creates the user with a nested organization and STARTER trial", async () => {
    const result = await provisionUserWithOrganization({
      prisma,
      name: "Jane",
      email: "jane@x.com",
    });

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        name: "Jane",
        email: "jane@x.com",
        role: "ADMIN",
        organization: {
          create: expect.objectContaining({
            name: "Jane's Organization",
            subscription: {
              create: expect.objectContaining({
                planTier: "STARTER",
                status: "TRIALING",
                trialEndsAt: expect.any(Date),
              }),
            },
          }),
        },
      },
      select: { id: true, organizationId: true },
    });
    expect(result).toEqual({ userId: "u-1", organizationId: "org-1" });
  });

  it("uses the provided organization name when given", async () => {
    await provisionUserWithOrganization({
      prisma,
      name: "Jane",
      email: "jane@x.com",
      organizationName: "Acme Inc.",
    });

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization: { create: expect.objectContaining({ name: "Acme Inc." }) },
        }),
      })
    );
  });

  it("falls back to the default org name when organizationName is whitespace-only", async () => {
    await provisionUserWithOrganization({
      prisma,
      name: "Jane",
      email: "jane@x.com",
      organizationName: "   ",
    });

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization: { create: expect.objectContaining({ name: "Jane's Organization" }) },
        }),
      })
    );
  });

  it("stores the password hash when provided (credentials registration)", async () => {
    await provisionUserWithOrganization({
      prisma,
      name: "Jane",
      email: "jane@x.com",
      passwordHash: "$2a$hash",
    });

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ password: "$2a$hash" }),
      })
    );
  });

  it("saves the Stripe customer id on the subscription when Stripe is configured", async () => {
    mockCreateStripeCustomer.mockResolvedValueOnce("cus_123");

    await provisionUserWithOrganization({ prisma, name: "Jane", email: "jane@x.com" });

    expect(mockPrisma.organizationSubscription.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { stripeCustomerId: "cus_123" },
    });
  });

  it("still succeeds when Stripe customer creation fails", async () => {
    mockCreateStripeCustomer.mockRejectedValueOnce(new Error("stripe down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await provisionUserWithOrganization({
      prisma,
      name: "Jane",
      email: "jane@x.com",
    });

    expect(result).toEqual({ userId: "u-1", organizationId: "org-1" });
    consoleSpy.mockRestore();
  });

  it("still succeeds when saving the Stripe customer id fails", async () => {
    mockCreateStripeCustomer.mockResolvedValueOnce("cus_123");
    mockPrisma.organizationSubscription.update.mockRejectedValueOnce(new Error("db down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await provisionUserWithOrganization({
      prisma,
      name: "Jane",
      email: "jane@x.com",
    });

    expect(result).toEqual({ userId: "u-1", organizationId: "org-1" });
    expect(consoleSpy).toHaveBeenCalledWith(
      "[auth.provision] Stripe customer creation failed",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("does not create a Stripe customer update when no customer id is returned", async () => {
    mockCreateStripeCustomer.mockResolvedValueOnce(null);

    await provisionUserWithOrganization({ prisma, name: "Jane", email: "jane@x.com" });

    expect(mockPrisma.organizationSubscription.update).not.toHaveBeenCalled();
  });
});
