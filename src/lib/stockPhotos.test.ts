import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchStockPhotos, leadPhotoQuery } from "./stockPhotos";

describe("fetchStockPhotos", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns an empty array when PEXELS_API_KEY is not set", async () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    expect(await fetchStockPhotos("landscaping")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns photo URLs from the Pexels search response", async () => {
    vi.stubEnv("PEXELS_API_KEY", "pexels-key");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        photos: [
          { src: { large: "https://images.pexels.com/1.jpg" } },
          { src: { large: "https://images.pexels.com/2.jpg" } },
          { src: {} },
        ],
      }),
    });

    const urls = await fetchStockPhotos("landscaping", 3);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pexels.com/v1/search?query=landscaping&per_page=3",
      { headers: { Authorization: "pexels-key" } },
    );
    expect(urls).toEqual(["https://images.pexels.com/1.jpg", "https://images.pexels.com/2.jpg"]);
  });

  it("returns an empty array on API errors", async () => {
    vi.stubEnv("PEXELS_API_KEY", "pexels-key");
    fetchMock.mockResolvedValue({ ok: false });
    expect(await fetchStockPhotos("roofers")).toEqual([]);
  });

  it("returns an empty array when fetch throws", async () => {
    vi.stubEnv("PEXELS_API_KEY", "pexels-key");
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await fetchStockPhotos("roofers")).toEqual([]);
  });

  it("returns an empty array for a blank query", async () => {
    vi.stubEnv("PEXELS_API_KEY", "pexels-key");
    expect(await fetchStockPhotos("  ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("leadPhotoQuery", () => {
  it("derives the category from a scraper-imported source", () => {
    expect(leadPhotoQuery({ source: "GoogleMaps / Landscaping / Austin, TX" })).toBe("landscaping");
  });

  it("falls back to a generic query when source is missing or unstructured", () => {
    expect(leadPhotoQuery({ source: null })).toBe("local business");
    expect(leadPhotoQuery({ source: "Referral" })).toBe("local business");
  });
});
