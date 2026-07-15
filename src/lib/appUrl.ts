/** First non-blank candidate, trimmed and with any trailing slash removed. */
function resolveBaseUrl(candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed.replace(/\/+$/, "");
  }
  return "";
}

/**
 * Absolute base URL of the app for operator-facing links and endpoints the
 * deployment itself must reach (Stripe redirects, Twilio status callbacks).
 * NEXTAUTH_URL is the canonical deployment URL; NEXT_PUBLIC_APP_URL covers
 * configs where only the public URL is set. Blank env values are skipped.
 */
export function appBaseUrl(fallback = ""): string {
  return resolveBaseUrl([
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    fallback,
  ]);
}

/**
 * Base URL for links sent to prospects/customers (demo sites). Prefers
 * NEXT_PUBLIC_APP_URL — the documented public URL — over NEXTAUTH_URL, which
 * may be an internal/auth-only origin.
 */
export function publicAppUrl(fallback = ""): string {
  return resolveBaseUrl([
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    fallback,
  ]);
}
