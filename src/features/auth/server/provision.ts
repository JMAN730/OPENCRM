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
 *
 * Callers must catch Prisma `P2002` errors from this provisioning function
 * and handle concurrent duplicate-email races gracefully.
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

  // Single nested create keeps org + subscription + user atomic — a
  // concurrent duplicate sign-in that loses the unique-email race leaves
  // no orphaned Organization behind.
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
  // organizationId is non-null by construction (nested create above).
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
  } catch (err) {
    console.error("[auth.provision] Stripe customer creation failed", err);
  }

  return { userId: user.id, organizationId };
}
