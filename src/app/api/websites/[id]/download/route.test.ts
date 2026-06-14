import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  default: { readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) },
}));

vi.mock("fflate", () => ({
  zipSync: vi.fn().mockReturnValue(new Uint8Array([9, 8, 7])),
}));

vi.mock("@/server/trpc", () => ({
  createTRPCContext: vi.fn(),
}));

import { zipSync } from "fflate";
import { createTRPCContext } from "@/server/trpc";
import { GET } from "./route";

const mockedCreateTRPCContext = vi.mocked(createTRPCContext);

describe("GET /api/websites/[id]/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateTRPCContext.mockResolvedValue({
      headers: new Headers(),
      session: {
        user: { id: "user-1", organizationId: "org-1" },
        expires: new Date(Date.now() + 1000).toISOString(),
      },
      prisma: {
        generatedWebsite: { findFirst },
      },
    } as never);
  });

  it("returns a zip for an org-scoped AI demo website", async () => {
    findFirst.mockResolvedValue({
      id: "site-1",
      template: "ai_demo",
      title: "Acme - Demo Site",
      content: {
        headline: "Acme in Tampa",
        subheadline: "Reliable local service.",
        services: ["Repair"],
        local_seo_headline: "Acme serves Tampa",
        cta: "Call now",
        contact_heading: "Contact Acme",
        contact_body: "Reach out today.",
        testimonials: [],
        city_body_copy: "Local service in Tampa.",
      },
      lead: { company: "Acme", phone: "555", city: "Tampa", source: "Repair" },
    });

    const response = await GET(new Request("http://test.local/api/websites/site-1/download") as never, {
      params: Promise.resolve({ id: "site-1" }),
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="acme.zip"');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "site-1", lead: { organizationId: "org-1" } },
    }));
    const archiveEntries = vi.mocked(zipSync).mock.calls[0]?.[0] as Record<string, Uint8Array>;
    expect(archiveEntries["index.html"]?.constructor.name).toBe("Uint8Array");
    expect(archiveEntries["assets/logo.png"]?.constructor.name).toBe("Uint8Array");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("returns unauthorized without a session", async () => {
    mockedCreateTRPCContext.mockResolvedValue({
      headers: new Headers(),
      session: null,
      prisma: { generatedWebsite: { findFirst } },
    } as never);

    const response = await GET(new Request("http://test.local/api/websites/site-1/download") as never, {
      params: Promise.resolve({ id: "site-1" }),
    } as never);

    expect(response.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns not found for websites outside the organization scope", async () => {
    findFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://test.local/api/websites/site-1/download") as never, {
      params: Promise.resolve({ id: "site-1" }),
    } as never);

    expect(response.status).toBe(404);
  });
});
