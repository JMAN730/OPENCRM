import { describe, it, expect, vi, beforeEach } from "vitest";
import { safeGet, safeSetEx, safeDel } from "@/lib/redis";
import { cached, invalidate } from "./cache";

// The global setup in src/test/setup.ts mocks @/lib/redis.
// Cast to vi.Mock so individual tests can override return values.
const mockGet = safeGet as ReturnType<typeof vi.fn>;
const mockSetEx = safeSetEx as ReturnType<typeof vi.fn>;
const mockDel = safeDel as ReturnType<typeof vi.fn>;

describe("cached", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSetEx.mockResolvedValue(true);
  });

  it("calls loader on cache miss and stores result with correct TTL", async () => {
    const loader = vi.fn().mockResolvedValue({ score: 42 });
    const result = await cached({ key: "test:key", ttl: 60 }, loader);

    expect(result).toEqual({ score: 42 });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(mockSetEx).toHaveBeenCalledWith("test:key", 60, JSON.stringify({ score: 42 }));
  });

  it("returns parsed cached value without invoking loader", async () => {
    mockGet.mockResolvedValue(JSON.stringify({ score: 99 }));
    const loader = vi.fn();

    const result = await cached({ key: "test:key", ttl: 60 }, loader);

    expect(result).toEqual({ score: 99 });
    expect(loader).not.toHaveBeenCalled();
    expect(mockSetEx).not.toHaveBeenCalled();
  });

  it("falls through to loader when cached JSON is corrupted and overwrites the entry", async () => {
    mockGet.mockResolvedValue("{not valid json{{");
    const loader = vi.fn().mockResolvedValue({ fresh: true });

    const result = await cached({ key: "bad:key", ttl: 30 }, loader);

    expect(result).toEqual({ fresh: true });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(mockSetEx).toHaveBeenCalledWith("bad:key", 30, JSON.stringify({ fresh: true }));
  });

  it("still returns the loader value when safeSetEx fails (fail-open)", async () => {
    mockSetEx.mockResolvedValue(false);
    const loader = vi.fn().mockResolvedValue("fresh-data");

    const result = await cached({ key: "k", ttl: 10 }, loader);

    expect(result).toBe("fresh-data");
  });

  it("invokes loader every time when Redis is unavailable (safeGet returns null)", async () => {
    mockGet.mockResolvedValue(null);
    const loader = vi.fn().mockResolvedValue("value");

    await cached({ key: "k", ttl: 10 }, loader);
    await cached({ key: "k", ttl: 10 }, loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("works for array values", async () => {
    const loader = vi.fn().mockResolvedValue([1, 2, 3]);
    const result = await cached({ key: "arr", ttl: 5 }, loader);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe("invalidate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls safeDel with the provided key", async () => {
    await invalidate("scope:lead:user-1");
    expect(mockDel).toHaveBeenCalledWith("scope:lead:user-1");
  });

});
