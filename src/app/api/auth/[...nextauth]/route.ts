import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { keys } from "@/lib/cacheKeys";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

const handler = NextAuth(authOptions);

type AuthRouteContext = {
  params: Promise<{ nextauth: string[] }>;
};

async function rateLimitedHandler(
  request: NextRequest,
  context: AuthRouteContext
) {
  const { nextauth } = await context.params;
  const isGoogleCallback =
    nextauth.length === 2 &&
    nextauth[0] === "callback" &&
    nextauth[1] === "google";

  if (isGoogleCallback) {
    // This is deliberately a coarse shared-IP backstop. Keep its ceiling high
    // enough for corporate NATs; the tighter per-email limiter in signIn still
    // handles repeated provisioning attempts for an individual account.
    // Route handlers need an HTTP 429 response, so use the non-throwing helper.
    const result = await rateLimit({
      key: keys.authOauthProvisionIpBucket(getClientIp(request.headers)),
      limit: 100,
      windowSeconds: 60 * 60,
    });

    if (!result.ok) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((result.resetAt - Date.now()) / 1000)
      );
      return new Response("Too many Google sign-in attempts. Please try again later.", {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      });
    }
  }

  return handler(request, context);
}

export { rateLimitedHandler as GET, rateLimitedHandler as POST };
