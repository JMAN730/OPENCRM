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
    // Route handlers need to return an HTTP 429 response; the throwing helper
    // is reserved for tRPC procedures, where TRPCError is serialized correctly.
    const result = await rateLimit({
      key: keys.authOauthProvisionIpBucket(getClientIp(request.headers)),
      limit: 10,
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
