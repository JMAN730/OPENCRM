import { TRPCError } from "@trpc/server";
import { redis } from "@/lib/redis";

export type RateLimitOptions = {
  /** Stable identifier for the bucket (e.g. `auth:signin:1.2.3.4:abcd`). */
  key: string;
  /** Maximum requests allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /**
   * How many units this call consumes from the bucket (default 1). Batch
   * endpoints pass their batch size so e.g. a 20-draft bulk send draws 20
   * from the same budget as 20 single sends.
   */
  cost?: number;
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
  const { key, limit, windowSeconds, cost = 1 } = opts;
  const bucket = `ratelimit:${key}`;
  try {
    const pipeline = redis.multi();
    pipeline.incrby(bucket, cost);
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
 * Always honours x-real-ip when present (a single-value header that's not
 * spoofable by clients in most proxy configurations).
 *
 * When TRUSTED_PROXY=true, also consults x-forwarded-for and uses its first
 * hop. Without TRUSTED_PROXY, x-forwarded-for is only used as a last-resort
 * fallback (taking the rightmost entry, which is closer to the proxy and
 * harder for clients to fully control end-to-end). If no usable header is
 * present, returns "unknown" — but that's still better than letting one
 * bucket absorb every request silently.
 */
export function getClientIp(headers: Headers): string {
  const trustProxy = process.env.TRUSTED_PROXY === "true";

  // x-real-ip wins if present — it's set explicitly by a single proxy hop.
  const real = headers.get("x-real-ip");
  if (real) return real.trim();

  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      // With a trusted proxy the leftmost entry is the original client.
      // Without it, the rightmost entry is the most-recent (proxy-set) hop,
      // which clients can't fully forge.
      const candidate = trustProxy ? parts[0] : parts[parts.length - 1];
      if (candidate) return candidate;
    }
  }

  if (!real && !fwd && !ipWarningEmitted) {
    ipWarningEmitted = true;
    console.warn(
      "[rateLimit] getClientIp: no x-real-ip or x-forwarded-for header found — " +
      "all clients will share the 'unknown' rate-limit bucket. Configure your " +
      "reverse proxy to forward one of these headers."
    );
  }
  return "unknown";
}

// Single-shot warning so log volume stays sane on busy hosts that lack the headers.
let ipWarningEmitted = false;
