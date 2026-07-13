import type { PrismaClient } from "@prisma/client";
import { createStripeCustomer } from "@/features/billing/server/stripe";
import { TRIAL_DAYS } from "@/features/billing/server/plans";
import { defaultSeatLimitForTier } from "@/features/billing/server/enforcement";

type ProvisionInput = {
  prisma: PrismaClient;
  name: string;
  email: string;
  passwordHash?: string;
  organizationName?: string;
};

export async function provisionUserWithOrganization({
  prisma,
  name,
  email,
  passwordHash,
  organizationName,
}: ProvisionInput) {
  const orgName = organizationName?.trim() || `${name}'s Organization`;
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      ...(passwordHash !== undefined && { password: passwordHash }),
      role: "ADMIN",
      organization: {
        create: {
          name: orgName,
          subscription: {
            create: {
              planTier: "STARTER",
              status: "TRIALING",
              seatLimit: defaultSeatLimitForTier("STARTER"),
              trialEndsAt,
            },
          },
        },
      },
    },
    select: { id: true, organizationId: true },
  });
  const organizationId = user.organizationId as string;

  try {
    const customerId = await createStripeCustomer({
      organizationId,
      organizationName: orgName,
      email,
    });
    if (customerId) {
      await prisma.organizationSubscription.update({
        where: { organizationId },
        data: { stripeCustomerId: customerId },
      });
    }
  } catch (error) {
    console.error("[auth.provision] Stripe customer creation failed", error);
  }

  return { userId: user.id, organizationId };
}
