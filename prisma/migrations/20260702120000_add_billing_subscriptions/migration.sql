-- Billing: organization subscriptions and Stripe webhook idempotency.

CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');
CREATE TYPE "PlanTier" AS ENUM ('STARTER', 'PRO', 'BUSINESS');

CREATE TABLE IF NOT EXISTS "OrganizationSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "planTier" "PlanTier" NOT NULL DEFAULT 'STARTER',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "seatLimit" INTEGER NOT NULL DEFAULT 3,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationSubscription_organizationId_key" ON "OrganizationSubscription"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationSubscription_stripeCustomerId_key" ON "OrganizationSubscription"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationSubscription_stripeSubscriptionId_key" ON "OrganizationSubscription"("stripeSubscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");

DO $$ BEGIN
    ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
