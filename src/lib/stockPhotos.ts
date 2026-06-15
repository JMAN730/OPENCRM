/**
 * Fetch up to `maxPhotos` stock photo URLs from the Pexels API.
 * Returns an empty array if PEXELS_API_KEY is missing, the query is empty,
 * or any error occurs — photo enrichment must never block site generation.
 */
export async function fetchStockPhotos(query: string, maxPhotos = 3): Promise<string[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !query.trim()) return [];
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${maxPhotos}`,
      { headers: { Authorization: apiKey } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      photos?: Array<{ src?: { large?: string } }>;
    };
    return (data.photos ?? [])
      .map((p) => p.src?.large)
      .filter((url): url is string => Boolean(url))
      .slice(0, maxPhotos);
  } catch {
    return [];
  }
}

/**
 * Derive a stock-photo search query from a lead. Scraper-imported leads carry
 * a source like "GoogleMaps / Landscaping / Austin, TX" — the category alone
 * makes the best search term. Falls back to a generic local-business query.
 */
export function leadPhotoQuery(lead: { source: string | null }): string {
  const parts = (lead.source ?? "").split("/").map((p) => p.trim()).filter(Boolean);
  const category =
    parts.length >= 2 && parts[0]?.toLowerCase().startsWith("googlemaps") ? parts[1] : null;
  return (category ?? "local business").toLowerCase();
}
