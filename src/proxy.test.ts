import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { getToken } from "next-auth/jwt";
import { config, proxy } from "./proxy";

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn(),
}));

const mockGetToken = vi.mocked(getToken);

describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches protected app routes and skips static assets", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/dashboard" })
    ).toBe(true);

    expect(
      unstable_doesMiddlewareMatch({ config, url: "/_next/static/chunks/app.js" })
    ).toBe(false);
  });

  it("bypasses public auth routes without checking a token", async () => {
    const response = await proxy(new NextRequest("http://localhost/auth/signin"));

    expect(mockGetToken).not.toHaveBeenCalled();
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("bypasses the Twilio voice webhook without checking a token", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/twilio/voice"));

    expect(mockGetToken).not.toHaveBeenCalled();
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    "/api/webhooks/resend",
    "/api/cron/scraper",
    "/t/abc123",
    "/demo/some-slug",
    "/unsubscribe/some-token",
  ])("bypasses the public endpoint %s without checking a token", async (path) => {
    const response = await proxy(new NextRequest(`http://localhost${path}`));

    expect(mockGetToken).not.toHaveBeenCalled();
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects unauthenticated protected pages to sign-in", async () => {
    mockGetToken.mockResolvedValue(null);

    const response = await proxy(new NextRequest("http://localhost/dashboard?tab=pipeline"));

    expect(getRedirectUrl(response)).toBe(
      "http://localhost/auth/signin?callbackUrl=%2Fdashboard%3Ftab%3Dpipeline"
    );
  });

  it("returns 401 for unauthenticated protected API routes", async () => {
    mockGetToken.mockResolvedValue(null);

    const response = await proxy(new NextRequest("http://localhost/api/trpc/leads.getAll"));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });
});
