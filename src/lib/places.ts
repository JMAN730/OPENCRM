/**
 * Fetch up to `maxPhotos` real business photo URLs from the Google Places API.
 * Returns an empty array if the API key is missing, the place is not found, or any error occurs.
 */
export async function fetchPlacePhotos(
  businessName: string,
  city: string | null,
  apiKey: string,
  maxPhotos = 3,
): Promise<string[]> {
  try {
    const query = [businessName, city].filter(Boolean).join(", ");
    const searchRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=photos&key=${encodeURIComponent(apiKey)}`
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json() as {
      candidates?: Array<{ photos?: Array<{ photo_reference: string }> }>;
    };
    const refs = searchData.candidates?.[0]?.photos?.slice(0, maxPhotos).map(p => p.photo_reference) ?? [];
    if (!refs.length) return [];

    // Follow the redirect to get the stable CDN URL (no API key in final URL)
    const urls: string[] = [];
    for (const ref of refs) {
      try {
        const photoRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(apiKey)}`,
          { redirect: "follow" }
        );
        if (photoRes.ok && photoRes.url) urls.push(photoRes.url);
      } catch { /* skip */ }
    }
    return urls;
  } catch {
    return [];
  }
}
