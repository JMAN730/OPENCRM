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
    const view = buildDemoView({ ...base, content: makeContent({ services: [] }) });
    expect(view.services).toEqual([]);
    expect(view.marqueeServices).toEqual(["Auto repair"]);
    expect(view.footer.serviceLinks).toEqual(["Auto repair"]);
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
});
