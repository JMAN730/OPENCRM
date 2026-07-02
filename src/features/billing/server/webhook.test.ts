import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPrisma } from "@/test/trpc";
import { processStripeWebhookEvent } from "@/features/billing/server/webhook";

describe("processStripeWebhookEvent", () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_test");
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter_test");
    vi.stubEnv("STRIPE_PRICE_BUSINESS", "price_business_test");
    prisma = createMockPrisma();
  });

  it("deduplicates webhook events by event id", async () => {
    prisma.stripeWebhookEvent.findUnique.mockResolvedValue({ id: "seen" });

    await processStripeWebhookEvent(prisma as never, {
      id: "evt_1",
      type: "invoice.paid",
      data: { object: { subscription: "sub_1" } },
    } as never);

    expect(prisma.organizationSubscription.updateMany).not.toHaveBeenCalled();
    expect(prisma.stripeWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("syncs subscription updates from Stripe", async () => {
    await processStripeWebhookEvent(prisma as never, {
      id: "evt_2",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          metadata: { organizationId: "org-1" },
          items: {
            data: [{ price: { id: "price_pro_test" }, quantity: 10, current_period_end: 1893456000 }],
          },
          trial_end: null,
          cancel_at_period_end: false,
        },
      },
    } as never);

    expect(prisma.organizationSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
        create: expect.objectContaining({
          planTier: "PRO",
          status: "ACTIVE",
          seatLimit: 10,
        }),
      }),
    );
    expect(prisma.stripeWebhookEvent.create).toHaveBeenCalledWith({
      data: { eventId: "evt_2", type: "customer.subscription.updated" },
    });
  });

  it("marks subscriptions past due on failed invoice payment", async () => {
    await processStripeWebhookEvent(prisma as never, {
      id: "evt_3",
      type: "invoice.payment_failed",
      data: {
        object: {
          parent: {
            subscription_details: { subscription: "sub_123" },
          },
        },
      },
    } as never);

    expect(prisma.organizationSubscription.updateMany).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: "sub_123" },
      data: { status: "PAST_DUE" },
    });
  });
});
