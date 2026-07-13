import { describe, expect, it } from "vitest";
import {
  buildDemoExport,
  demoExportAssetSources,
  renderDemoHtml,
} from "@/features/websites/server/export";
import type { DemoExportSite } from "@/features/websites/server/export";
import { packForCategory } from "@/features/websites/packs";

const site: DemoExportSite = {
  title: "Acme Auto - Demo Site",
  businessName: "Acme <Auto>",
  phone: "555-123-4567",
  city: "Tampa",
  category: "Auto Repair",
  content: {
    headline: "Acme Auto in Tampa",
    subheadline: "Reliable repairs and clear communication.",
    services: ["Oil Changes", "Brake Repair"],
    local_seo_headline: "Acme Auto serves Tampa",
    cta: "Call now",
    contact_heading: "Contact Acme Auto",
    contact_body: "Reach out for service in Tampa.",
    testimonials: [{ quote: "Fast and fair.", author: "Maria R." }],
    city_body_copy: "Helpful local auto repair in Tampa.",
    photos: [],
  },
};

describe("demo website export", () => {
  it("renders escaped standalone HTML with bundled asset references", () => {
    const html = renderDemoHtml(site);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Acme &lt;Auto&gt;");
    expect(html).toContain("assets/logo.png");
    // No lead photos → pack fallback photos, rewritten to bundled asset paths.
    const pack = packForCategory(site.category);
    expect(html).toContain(`assets/${pack.photos[0].split("/").filter(Boolean).join("-")}`);
    expect(html).toContain("Oil Changes");
    expect(html).not.toContain("Acme <Auto>");
  });

  it("themes the CSS from the resolved Template Pack", () => {
    const html = renderDemoHtml(site);
    expect(html).toContain(packForCategory(site.category).theme.accent);
  });

  it("lists the pack's local photos as export asset sources", () => {
    const pack = packForCategory(site.category);
    const sources = demoExportAssetSources(site);
    expect(sources).toContainEqual({
      source: "public/demo-template/logo.png",
      target: "assets/logo.png",
    });
    expect(sources).toContainEqual({
      source: `public${pack.photos[0]}`,
      target: `assets/${pack.photos[0].split("/").filter(Boolean).join("-")}`,
    });
  });

  it("leaves remote lead photos untouched and unbundled", () => {
    const withRemote: DemoExportSite = {
      ...site,
      content: { ...site.content, photos: ["https://example.com/p.jpg"] },
    };
    const html = renderDemoHtml(withRemote);
    expect(html).toContain("https://example.com/p.jpg");
    const sources = demoExportAssetSources(withRemote);
    expect(sources.every((asset) => !asset.source.includes("example.com"))).toBe(true);
  });

  it("builds a zip-friendly file list", () => {
    const result = buildDemoExport(site, [{ path: "assets/logo.png", data: new Uint8Array([1]) }]);

    expect(result.filename).toBe("acme-auto.zip");
    expect(result.files.map((file) => file.path)).toEqual(["index.html", "assets/logo.png"]);
    expect(new TextDecoder().decode(result.files[0].data)).toContain("Acme &lt;Auto&gt;");
  });
});
