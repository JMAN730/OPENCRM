import Stripe from "stripe";

let stripeClient: Stripe | null | undefined;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripe(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;

  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    stripeClient = null;
    return null;
  }

  stripeClient = new Stripe(secret, {
    typescript: true,
  });
  return stripeClient;
}

export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing).");
  }
  return stripe;
}

export async function createStripeCustomer(params: {
  organizationId: string;
  organizationName: string;
  email: string;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const customer = await stripe.customers.create({
    email: params.email,
    name: params.organizationName,
    metadata: { organizationId: params.organizationId },
  });

  return customer.id;
}
