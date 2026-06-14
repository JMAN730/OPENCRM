import { describe, it, expect, vi, beforeEach } from "vitest";

// Remove the global mock from setup.ts so we test the real implementation.
vi.unmock("@/lib/redis");

// Mock ioredis before the real @/lib/redis module is imported.
const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  on: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: vi.fn(() => mockRedis),
}));

// Import the actual module (not the mock) after all vi.mock/vi.unmock calls.
const { safeGet, safeSetEx, safeDel } = await import("@/lib/redis");

describe("safeGet", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the stored string on a hit", async () => {
    mockRedis.get.mockResolvedValue("cached-value");
    expect(await safeGet("k")).toBe("cached-value");
  });

  it("returns null on a miss", async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await safeGet("k")).toBeNull();
  });

  it("returns null and logs a warning when Redis throws", async () => {
    mockRedis.get.mockRejectedValue(new Error("ECONNREFUSED"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await safeGet("k")).toBeNull();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe("safeSetEx", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true on success", async () => {
    mockRedis.setex.mockResolvedValue("OK");
    expect(await safeSetEx("k", 60, "v")).toBe(true);
    expect(mockRedis.setex).toHaveBeenCalledWith("k", 60, "v");
  });

  it("returns false and logs a warning when Redis throws", async () => {
    mockRedis.setex.mockRejectedValue(new Error("ECONNREFUSED"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await safeSetEx("k", 60, "v")).toBe(false);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe("safeDel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the key and resolves without a value", async () => {
    mockRedis.del.mockResolvedValue(1);
    await expect(safeDel("k")).resolves.toBeUndefined();
    expect(mockRedis.del).toHaveBeenCalledWith("k");
  });

  it("does not throw when Redis errors — resolves silently", async () => {
    mockRedis.del.mockRejectedValue(new Error("ECONNREFUSED"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(safeDel("k")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
