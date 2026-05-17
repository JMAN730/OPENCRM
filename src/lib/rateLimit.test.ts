import { describe, it, expect, beforeEach, vi } from "vitest";

// The global test setup mocks `@/lib/rateLimit` to a no-op. To exercise the
// real limiter logic, we re-import it via vi.importActual and inject a fake
// Redis client whose pipeline we can program per test.
const { mockRedis } = vi.hoisted(() => ({
  mockRedis: {
    multi: vi.fn(),
  },
}));

vi.mock("@/lib/redis", async () => {
  const actual = await vi.importActual<typeof import("./redis")>("./redis");
  return { ...actual, redis: mockRedis };
});

let rateLimit: typeof import("./rateLimit").rateLimit;
let assertWithinRateLimit: typeof import("./rateLimit").assertWithinRateLimit;
let getClientIp: typeof import("./rateLimit").getClientIp;

beforeEach(async () => {
  vi.resetModules();
  vi.unmock("@/lib/rateLimit");
  const actual = await vi.importActual<typeof import("./rateLimit")>("./rateLimit");
  rateLimit = actual.rateLimit;
  assertWithinRateLimit = actual.assertWithinRateLimit;
  getClientIp = actual.getClientIp;
  mockRedis.multi.mockReset();
});

function programPipeline(count: number, pttlMs: number) {
  const pipeline = {
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    pttl: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([
      [null, count],
      [null, 1],
      [null, pttlMs],
    ]),
  };
  mockRedis.multi.mockReturnValue(pipeline);
  return pipeline;
}

describe("rateLimit", () => {
  it("returns ok=true when the count is at or below the limit", async () => {
    programPipeline(3, 30_000);

    const r = await rateLimit({ key: "k", limit: 5, windowSeconds: 60 });

    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it("returns ok=false once the bucket is exhausted", async () => {
    programPipeline(6, 15_000);

    const r = await rateLimit({ key: "k", limit: 5, windowSeconds: 60 });

    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("fails open when Redis throws (don't lock everyone out on outage)", async () => {
    mockRedis.multi.mockReturnValue({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockRejectedValue(new Error("redis down")),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const r = await rateLimit({ key: "k", limit: 5, windowSeconds: 60 });

    expect(r.ok).toBe(true);
    warnSpy.mockRestore();
  });

  it("uses fixed-window keys prefixed with ratelimit:", async () => {
    const pipeline = programPipeline(1, 60_000);

    await rateLimit({ key: "auth:signin:x@y.com", limit: 5, windowSeconds: 60 });

    expect(pipeline.incr).toHaveBeenCalledWith("ratelimit:auth:signin:x@y.com");
  });
});

describe("assertWithinRateLimit", () => {
  it("throws TOO_MANY_REQUESTS when the limit is exceeded", async () => {
    programPipeline(99, 30_000);

    await expect(
      assertWithinRateLimit({ key: "k", limit: 5, windowSeconds: 60 }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("returns silently when within the limit", async () => {
    programPipeline(1, 30_000);

    await expect(
      assertWithinRateLimit({ key: "k", limit: 5, windowSeconds: 60 }),
    ).resolves.toBeUndefined();
  });
});

describe("getClientIp", () => {
  it("returns x-real-ip by default (untrusted proxy)", () => {
    const h = new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" });
    expect(getClientIp(h)).toBe("1.2.3.4");
  });

  it("trusts x-forwarded-for first hop when TRUSTED_PROXY=true", () => {
    const prev = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = "true";
    const h = new Headers({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" });
    expect(getClientIp(h)).toBe("5.6.7.8");
    process.env.TRUSTED_PROXY = prev;
  });

  it("falls back to x-forwarded-for rightmost entry when only x-forwarded-for is present and proxy is untrusted", () => {
    const prev = process.env.TRUSTED_PROXY;
    delete process.env.TRUSTED_PROXY;
    const h = new Headers({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" });
    // Rightmost is the most-recent (proxy-set) hop a client cannot fully forge.
    expect(getClientIp(h)).toBe("9.9.9.9");
    if (prev !== undefined) process.env.TRUSTED_PROXY = prev;
  });

  it("falls back to 'unknown' when no IP headers are present", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
