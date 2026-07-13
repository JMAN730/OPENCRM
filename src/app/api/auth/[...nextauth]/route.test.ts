import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuthHandler, mockRateLimit, mockGetClientIp } = vi.hoisted(() => ({
  mockAuthHandler: vi.fn(),
  mockRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => mockAuthHandler),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mockRateLimit,
  getClientIp: mockGetClientIp,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthHandler.mockResolvedValue(new Response("next-auth", { status: 200 }));
  mockRateLimit.mockResolvedValue({
    ok: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
  });
  mockGetClientIp.mockReturnValue("203.0.113.7");
});

describe("NextAuth route", () => {
  it("rate-limits Google OAuth callbacks by client IP before NextAuth runs", async () => {
    mockRateLimit.mockResolvedValueOnce({
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    const request = new NextRequest(
      "http://localhost/api/auth/callback/google?code=oauth-code",
      { headers: { "x-real-ip": "203.0.113.7" } }
    );

    const response = await GET(request, {
      params: Promise.resolve({ nextauth: ["callback", "google"] }),
    });

    expect(response.status).toBe(429);
    expect(mockGetClientIp).toHaveBeenCalledWith(request.headers);
    expect(mockRateLimit).toHaveBeenCalledWith({
      key: "auth:oauth-provision:ip:203.0.113.7",
      limit: 100,
      windowSeconds: 60 * 60,
    });
    expect(mockAuthHandler).not.toHaveBeenCalled();
  });

  it("passes allowed Google callbacks through to NextAuth", async () => {
    const request = new NextRequest(
      "http://localhost/api/auth/callback/google?code=oauth-code"
    );
    const context = {
      params: Promise.resolve({ nextauth: ["callback", "google"] }),
    };

    const response = await GET(request, context);

    expect(response.status).toBe(200);
    expect(mockAuthHandler).toHaveBeenCalledWith(request, context);
  });

  it("does not consume the IP bucket for other NextAuth routes", async () => {
    const request = new NextRequest("http://localhost/api/auth/session");
    const context = {
      params: Promise.resolve({ nextauth: ["session"] }),
    };

    await GET(request, context);

    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockAuthHandler).toHaveBeenCalledWith(request, context);
  });
});
