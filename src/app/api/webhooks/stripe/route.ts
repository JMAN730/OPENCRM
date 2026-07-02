import { prisma } from "@/lib/prisma";
import { getStripe } from "@/features/billing/server/stripe";
import { processStripeWebhookEvent } from "@/features/billing/server/webhook";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return new Response("Stripe not configured", { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await processStripeWebhookEvent(prisma, event);
  } catch (err) {
    console.error("[stripe webhook] handler error", err);
    return new Response("Webhook handler failed", { status: 500 });
  }

  return new Response("OK");
}
