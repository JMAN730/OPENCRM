/**
 * Absolute base URL of the app for building server-side links (Stripe
 * redirects, demo URLs, Twilio status callbacks). No trailing slash.
 * NEXTAUTH_URL is the canonical deployment URL; NEXT_PUBLIC_APP_URL covers
 * configs where only the public URL is set.
 */
export function appBaseUrl(fallback = ""): string {
  return (process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? fallback).replace(
    /\/$/,
    "",
  );
}
