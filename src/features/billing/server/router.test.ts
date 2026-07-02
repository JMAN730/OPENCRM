import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestCaller } from "@/test/trpc";

vi.mock("@/features/billing/server/stripe", () => ({
  isStripeConfigured: vi.fn().mockReturnValue(true),
  requireStripe: vi.fn().mockReturnValue({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/session" }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.test/portal" }),
      },
    },
  }),
  createStripeCustomer: vi.fn().mockResolvedValue("cus_test"),
  getStripe: vi.fn(),
}));

describe("billingRouter", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_test");
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter_test");
    vi.stubEnv("STRIPE_PRICE_BUSINESS", "price_business_test");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
  });

  it("returns subscription summary with seat usage", async () => {
    const { caller, prisma } = createTestCaller();
    prisma.organizationSubscription.findUnique.mockResolvedValue({
      planTier: "PRO",
      status: "ACTIVE",
      seatLimit: 10,
      trialEndsAt: null,
      currentPeriodEnd: new Date("2030-01-01"),
      cancelAtPeriodEnd: false,
    });
    prisma.user.count.mockResolvedValue(2);
    prisma.invitation.count.mockResolvedValue(1);

    const result = await caller.billing.getSubscription();

    expect(result.planTier).toBe("PRO");
    expect(result.seatsUsed).toBe(3);
    expect(result.limits.maxTags).toBe(100);
  });

  it("requires admin for checkout", async () => {
    const { caller } = createTestCaller({
      sessionOverrides: { role: "USER" },
    });

    await expect(
      caller.billing.createCheckoutSession({ planTier: "PRO" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates a checkout session for admins", async () => {
    const { caller, prisma } = createTestCaller();
    prisma.organizationSubscription.findUnique.mockResolvedValue({
      id: "sub-1",
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null,
      seatLimit: 10,
      planTier: "STARTER",
      status: "TRIALING",
    });

    const result = await caller.billing.createCheckoutSession({ planTier: "PRO" });

    expect(result.url).toBe("https://checkout.stripe.test/session");
  });

  it("checks out the target tier's seat quantity, not the current one", async () => {
    const { requireStripe } = await import("@/features/billing/server/stripe");
    const sessionCreate = vi.mocked(requireStripe)().checkout.sessions.create;
    vi.mocked(sessionCreate).mockClear();

    const { caller, prisma } = createTestCaller();
    prisma.organizationSubscription.findUnique.mockResolvedValue({
      id: "sub-1",
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: null,
      seatLimit: 3,
      planTier: "STARTER",
      status: "TRIALING",
    });

    await caller.billing.createCheckoutSession({ planTier: "PRO" });

    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [expect.objectContaining({ quantity: 10 })],
      }),
    );
  });

  it("rejects checkout when a Stripe subscription already exists", async () => {
    const { caller, prisma } = createTestCaller();
    prisma.organizationSubscription.findUnique.mockResolvedValue({
      id: "sub-1",
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: "sub_live",
      seatLimit: 10,
      planTier: "PRO",
      status: "ACTIVE",
    });

    await expect(
      caller.billing.createCheckoutSession({ planTier: "BUSINESS" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("requires admin for billing portal", async () => {
    const { caller } = createTestCaller({
      sessionOverrides: { role: "MANAGER" },
    });

    await expect(caller.billing.createPortalSession()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
