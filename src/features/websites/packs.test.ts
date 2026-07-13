import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SCRAPER_CATEGORIES } from "@/server/scraper/config";
import { GENERIC_PACK, TEMPLATE_PACKS, nicheForCategory, packForCategory } from "./packs";

describe("template packs", () => {
  it("covers every scraper category with a niche pack", () => {
    for (const category of SCRAPER_CATEGORIES) {
      expect(packForCategory(category), `category "${category}" fell back to generic`).not.toBe(
        GENERIC_PACK,
      );
    }
  });

  it("matches categories case-insensitively and falls back for unknowns", () => {
    expect(packForCategory("landscaping").id).toBe("landscaping");
    expect(packForCategory("LANDSCAPING").id).toBe("landscaping");
    expect(packForCategory("Underwater basket weaving")).toBe(GENERIC_PACK);
    expect(packForCategory(null)).toBe(GENERIC_PACK);
    expect(packForCategory("  ")).toBe(GENERIC_PACK);
  });

  it("has unique pack ids", () => {
    const ids = TEMPLATE_PACKS.map((pack) => pack.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships every referenced photo in public/", () => {
    for (const pack of [...TEMPLATE_PACKS, GENERIC_PACK]) {
      for (const photo of pack.photos) {
        const file = path.join(process.cwd(), "public", photo);
        expect(fs.existsSync(file), `${pack.id}: missing ${photo}`).toBe(true);
      }
    }
  });

  it("nicheForCategory cleans pack-matched categories, passes unknowns through", () => {
    expect(nicheForCategory("Power washing Business")).toBe("Pressure washing");
    expect(nicheForCategory("Fencing Companies")).toBe("Fencing");
    expect(nicheForCategory("Dog Grooming")).toBe("Dog Grooming");
    expect(nicheForCategory(null)).toBeNull();
  });
});
