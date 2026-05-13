import { safeGet, safeSetEx, safeDel } from "@/lib/redis";

export type CacheOptions = {
  /** Stable key. Callers must include all variables (orgId, userId, etc). */
  key: string;
  /** TTL in seconds. */
  ttl: number;
};

/**
 * Read-through cache backed by Redis. Falls through to `loader` on miss and
 * stores the result with the given TTL. If Redis is unreachable the loader
 * is invoked every time and the result is never cached — the caller never
 * sees an error from the cache layer itself.
 *
 * JSON-serializable values only.
 */
export async function cached<T>(opts: CacheOptions, loader: () => Promise<T>): Promise<T> {
  const raw = await safeGet(opts.key);
  if (raw !== null) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Cache corruption — fall through to loader and overwrite.
    }
  }
  const fresh = await loader();
  await safeSetEx(opts.key, opts.ttl, JSON.stringify(fresh));
  return fresh;
}

/** Drop a single cache entry. Used after writes that invalidate the value. */
export async function invalidate(key: string): Promise<void> {
  await safeDel(key);
}
