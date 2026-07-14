import { describe, expect, it } from "vitest";
import { buildDemoView } from "./demoView";
import type { DemoContent } from "@/lib/ai";

function makeContent(overrides: Partial<DemoContent> = {}): DemoContent {
  return {
    headline: "Honest repairs done fast",
    subheadline: "keeps your car on the road.",
    cta: "Book now",
    services: ["Oil Changes", "Brakes", "Diagnostics"],
    local_seo_headline: "Trusted mechanics in Austin.",
    city_body_copy: "We serve the whole metro area.",
    contact_heading: "Same-day slots available.",
    contact_body: "Call or drop by.",
    testimonials: [{ author: "Sam", quote: "Great work." }],
    ...overrides,
  } as DemoContent;
}

const base = {
  businessName: "Acme Auto",
  phone: "(512) 555-0100",
  city: "Austin",
  category: "Auto repair",
  content: makeContent(),
};

describe("buildDemoView", () => {
  it("derives the tel: href from the phone, null without one", () => {
    expect(buildDemoView(base).telHref).toBe("tel:5125550100");
    expect(buildDemoView({ ...base, phone: null }).telHref).toBeNull();
  });

  it("falls back specialty and service area", () => {
    const view = buildDemoView({ ...base, category: null, city: null });
    expect(view.specialty).toBe("Local service");
    expect(view.serviceArea).toBe("Local area");
  });

  it("treats empty-string category/city like missing (scraper imports)", () => {
    const view = buildDemoView({ ...base, category: "", city: "" });
    expect(view.specialty).toBe("Local service");
    expect(view.serviceArea).toBe("Local area");
  });

  it("splits long headlines into at most four two-word lines", () => {
    const view = buildDemoView({
      ...base,
      content: makeContent({ headline: "one two three four five six seven eight nine ten" }),
    });
    expect(view.headlineLines).toEqual(["one two", "three four", "five six", "seven eight"]);
  });

  it("keeps short headlines as single words and survives an empty headline", () => {
    expect(buildDemoView(base).headlineLines).toEqual(["Honest", "repairs", "done", "fast"]);
    const view = buildDemoView({ ...base, businessName: "", content: makeContent({ headline: "  " }) });
    expect(view.headlineLines).toEqual(["Demo", "Site"]);
  });

  it("marquee services fall back to the specialty when the AI returned none", () => {
    // "Auto repair" matches the Mobile Mechanics pack, so the specialty is the
    // pack's copy-safe niche label, not the raw scraper category.
    const view = buildDemoView({ ...base, content: makeContent({ services: [] }) });
    expect(view.services).toEqual([]);
    expect(view.marqueeServices).toEqual(["Mobile mechanic"]);
    expect(view.footer.serviceLinks).toEqual(["Mobile mechanic"]);
  });

  it("passes an unmatched category through as the specialty", () => {
    const view = buildDemoView({ ...base, category: "Chimney Sweep" });
    expect(view.specialty).toBe("Chimney Sweep");
  });

  it("filters blank photos and honors the photos override", () => {
    const view = buildDemoView({
      ...base,
      photos: ["a.jpg", "", "b.jpg"],
      content: makeContent({ photos: ["ignored.jpg"] } as Partial<DemoContent>),
    });
    expect(view.photos).toEqual(["a.jpg", "b.jpg"]);
  });

  it("header CTA is Call Now with a phone, the AI CTA without", () => {
    expect(buildDemoView(base).headerCta).toBe("Call Now");
    expect(buildDemoView({ ...base, phone: null }).headerCta).toBe("Book now");
  });

  it("both adapters read one map embed URL", () => {
    expect(buildDemoView(base).mapEmbedUrl).toBe(
      "https://www.google.com/maps?q=Acme%20Auto%20Austin&output=embed",
    );
  });

  it("resolves the generic pack for unknown categories and exposes its theme", () => {
    const view = buildDemoView({ ...base, category: "Underwater basket weaving" });
    expect(view.packId).toBe("generic");
    expect(view.theme.accent).toBeTruthy();
  });

  it("falls back to the pack's curated photos when the lead has none", () => {
    const view = buildDemoView({ ...base, content: makeContent({ photos: [] }) });
    expect(view.photos.length).toBeGreaterThan(0);
    expect(view.photos[0]).toMatch(/^\//);
  });

  it("shows the real Google rating when the scraper captured it", () => {
    const view = buildDemoView({ ...base, rating: 4.8, reviewCount: 127 });
    expect(view.reviewsBadge).toEqual({
      score: "4.8",
      stars: "★★★★★",
      note: "127 Google reviews",
    });
  });

  it("rounds partial ratings into the star row", () => {
    const view = buildDemoView({ ...base, rating: 3.4, reviewCount: 12 });
    expect(view.reviewsBadge.score).toBe("3.4");
    expect(view.reviewsBadge.stars).toBe("★★★☆☆");
  });

  it("keeps the neutral demo badge without a rating", () => {
    const view = buildDemoView({ ...base, rating: null, reviewCount: null });
    expect(view.reviewsBadge).toEqual({ score: "5.0", stars: "★★★★★", note: "Demo reviews" });
  });
});
