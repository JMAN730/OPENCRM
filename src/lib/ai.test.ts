import { describe, it, expect, afterEach, vi } from "vitest";
import type { Lead } from "@prisma/client";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({ chat: { completions: { create } } })),
}));

import { generateDemoContent, generateEmailCopy, type DemoContent } from "./ai";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    company: "Rick's Power Wash",
    city: "Austin",
    category: "Power washing",
    source: "GoogleMaps / Power washing / Austin, TX",
    firstName: null,
    lastName: null,
    phone: "512-555-0100",
    website: null,
    qualificationSummary: null,
    ...overrides,
  } as Lead;
}

const validContent: DemoContent = {
  headline: "Pressure washing done right",
  subheadline: "Serving Austin homes and businesses.",
  services: ["Driveways", "Roofs", "Decks", "Fences"],
  local_seo_headline: "Power washing in Austin",
  cta: "Get a free quote",
  contact_heading: "Contact us",
  contact_body: "Call today.",
  testimonials: [
    { quote: "Great job.", author: "Sam T." },
    { quote: "Fast and clean.", author: "Dana W." },
  ],
  city_body_copy: "Austin homes stay clean with us.",
};

describe("generateDemoContent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    create.mockReset();
  });

  it("returns fallback content without calling the API when no key is set", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const content = await generateDemoContent(lead());
    expect(create).not.toHaveBeenCalled();
    expect(content.headline).toContain("Rick's Power Wash");
  });

  it("uses lead.category as the niche, never lead.source", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const content = await generateDemoContent(lead({ category: "Power washing" }));
    const text = JSON.stringify(content).toLowerCase();
    expect(text).not.toContain("googlemaps");
  });

  it("sends the pack's clean niche to the model, not the source string", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "key");
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validContent) } }] });
    await generateDemoContent(lead());
    const messages = create.mock.calls[0][0].messages;
    const userPayload = JSON.parse(messages[1].content);
    // "Power washing" matches the power-washing pack → its copy-friendly specialty.
    expect(userPayload.niche).toBe("Pressure washing");
    expect(JSON.stringify(messages)).not.toContain("GoogleMaps");
  });

  it("returns the model content when it validates", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "key");
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(validContent) } }] });
    const content = await generateDemoContent(lead());
    expect(content.headline).toBe(validContent.headline);
    expect(content.services).toEqual(validContent.services);
  });

  it("falls back instead of throwing when the model returns invalid JSON", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockResolvedValue({ choices: [{ message: { content: "not json {" } }] });
    const content = await generateDemoContent(lead());
    expect(content.headline).toContain("Rick's Power Wash");
  });

  it("falls back instead of throwing when the JSON fails schema validation", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ headline: "only a headline" }) } }],
    });
    const content = await generateDemoContent(lead());
    expect(content.services.length).toBeGreaterThan(0);
    expect(content.testimonials.length).toBeGreaterThan(0);
  });

  it("falls back instead of throwing when the API call rejects", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    create.mockRejectedValue(new Error("rate limited"));
    const content = await generateDemoContent(lead());
    expect(content.headline).toContain("Rick's Power Wash");
  });

  it("fallback copy uses the category, not the source, when no key is set", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const content = await generateDemoContent(lead({ category: "Landscaping" }));
    expect(JSON.stringify(content)).toContain("andscaping");
    expect(JSON.stringify(content)).not.toContain("GoogleMaps");
  });
});

describe("generateEmailCopy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    create.mockReset();
  });

  it("sends the pack's clean niche, never the source string", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "key");
    create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ subject: "s", observation: "o" }) } }],
    });
    await generateEmailCopy(lead());
    const userPayload = JSON.parse(create.mock.calls[0][0].messages[1].content);
    expect(userPayload.niche).toBe("Pressure washing");
  });
});
