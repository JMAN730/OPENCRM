import type { PrismaClient } from "@prisma/client";
import { createStripeCustomer } from "@/features/billing/server/stripe";
import { TRIAL_DAYS } from "@/features/billing/server/plans";
import { defaultSeatLimitForTier } from "@/features/billing/server/enforcement";

type ProvisionInput = {
  prisma: PrismaClient;
  name: string;
  email: string;
  /** bcrypt hash — omit for OAuth-only accounts */
  passwordHash?: string;
  organizationName?: string;
};

/**
 * Create a new Organization (with a 14-day STARTER trial) and its first
 * ADMIN user. Shared by credentials registration and first-time Google
 * OAuth sign-in. Stripe customer creation is best-effort.
 */
export async function provisionUserWithOrganization({
  prisma,
  name,
  email,
  passwordHash,
  organizationName,
}: ProvisionInput) {
  const orgName = organizationName?.trim() || `${name}'s Organization`;
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const organization = await prisma.organization.create({
    data: {
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
  });

  const user = await prisma.user.create({
    data: {
      name,
      email,
      ...(passwordHash !== undefined && { password: passwordHash }),
      organizationId: organization.id,
      role: "ADMIN",
    },
  });

  try {
    const customerId = await createStripeCustomer({
      organizationId: organization.id,
      organizationName: orgName,
      email,
    });
    if (customerId) {
      await prisma.organizationSubscription.update({
        where: { organizationId: organization.id },
        data: { stripeCustomerId: customerId },
      });
    }
  } catch (err) {
    console.error("[auth.provision] Stripe customer creation failed", err);
  }

  return { userId: user.id, organizationId: organization.id };
}
