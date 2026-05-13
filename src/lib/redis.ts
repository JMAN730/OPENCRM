import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedis(): Redis {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const client = new Redis(url, {
    // Don't blow up the server when Redis is unreachable. Callers must
    // handle errors and fail open where appropriate (rate limiting,
    // session caching, etc.).
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  client.on("error", (err) => {
    // Log once per change to avoid flooding logs when Redis is down.
    console.warn("[redis] connection error:", err.message);
  });
  return client;
}

export const redis = globalForRedis.redis ?? createRedis();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

/**
 * Best-effort GET. Returns null and logs a warning if Redis is unreachable.
 */
export async function safeGet(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch (err) {
    console.warn("[redis] safeGet failed:", (err as Error).message);
    return null;
  }
}

/**
 * Best-effort SETEX. Returns false and logs a warning if Redis is unreachable.
 */
export async function safeSetEx(key: string, seconds: number, value: string): Promise<boolean> {
  try {
    await redis.setex(key, seconds, value);
    return true;
  } catch (err) {
    console.warn("[redis] safeSetEx failed:", (err as Error).message);
    return false;
  }
}

export async function safeDel(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    console.warn("[redis] safeDel failed:", (err as Error).message);
  }
}
