import { TRPCError } from "@trpc/server";
import { redis } from "@/lib/redis";

export type RateLimitOptions = {
  /** Stable identifier for the bucket (e.g. `auth:signin:1.2.3.4:abcd`). */
  key: string;
  /** Maximum requests allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Fixed-window rate limiter backed by Redis INCR + EXPIRE.
 * Fails open (returns ok=true) when Redis is unreachable so an outage
 * doesn't lock everyone out of the product.
 */
export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = opts;
  const bucket = `ratelimit:${key}`;
  try {
    const pipeline = redis.multi();
    pipeline.incr(bucket);
    pipeline.expire(bucket, windowSeconds, "NX");
    pipeline.pttl(bucket);
    const results = await pipeline.exec();
    if (!results) {
      return { ok: true, remaining: limit - 1, resetAt: Date.now() + windowSeconds * 1000 };
    }
    const count = Number(results[0]?.[1] ?? 0);
    const pttl = Number(results[2]?.[1] ?? windowSeconds * 1000);
    const remaining = Math.max(0, limit - count);
    const resetAt = Date.now() + (pttl > 0 ? pttl : windowSeconds * 1000);
    return { ok: count <= limit, remaining, resetAt };
  } catch (err) {
    console.warn("[rateLimit] Redis unreachable, failing open:", (err as Error).message);
    return { ok: true, remaining: limit, resetAt: Date.now() + windowSeconds * 1000 };
  }
}

/**
 * Throws TRPCError TOO_MANY_REQUESTS when the bucket is exhausted.
 * Pass a stable `key` derived from IP/email/userId.
 */
export async function assertWithinRateLimit(opts: RateLimitOptions & { message?: string }): Promise<void> {
  const result = await rateLimit(opts);
  if (!result.ok) {
    const seconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: opts.message ?? `Too many requests. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`,
    });
  }
}

/**
 * Extracts a best-effort client IP from request headers.
 *
 * Set TRUSTED_PROXY=true when the app runs behind a reverse proxy (Nginx,
 * Caddy, load balancer) that sets x-forwarded-for. Without it, only
 * x-real-ip is consulted. If neither header is present, all unauthenticated
 * requests share the "unknown" rate-limit bucket — configure your proxy to
 * forward one of these headers to avoid false bucket collisions.
 */
export function getClientIp(headers: Headers): string {
  const trustProxy = process.env.TRUSTED_PROXY === "true";
  if (trustProxy) {
    const fwd = headers.get("x-forwarded-for");
    if (fwd) {
      const first = fwd.split(",")[0]?.trim();
      if (first) return first;
    }
    const real = headers.get("x-real-ip");
    if (real) return real;
  }
  const real = headers.get("x-real-ip");
  if (real) return real;
  console.warn(
    "[rateLimit] getClientIp: no x-real-ip header found — all clients share " +
    "the same rate-limit bucket. Set TRUSTED_PROXY=true and configure your " +
    "reverse proxy to forward x-forwarded-for, or configure it to set x-real-ip."
  );
  return "unknown";
}
