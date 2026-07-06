import { safeGet, safeSetEx } from "@/lib/redis";
import type { MapBounds } from "@/features/map/shared/coords";

const OVERPASS_URL = () =>
  process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = () =>
  process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org/search";

// Nominatim and Overpass usage policies require an identifying User-Agent.
const USER_AGENT = "ClientCore/0.1 (lead-map)";

// City centroids never move; cache them for 30 days so repeat geocode runs
// stay off the Nominatim API entirely.
const GEOCODE_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

export type OsmBusiness = {
  osmType: string;
  osmId: number;
  name: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
};

/**
 * Map discovery categories → Overpass tag selectors. Each selector is a
 * single `key=value` pair that becomes one `nwr[...]` clause. Values follow
 * established OSM tagging conventions (taginfo-verified keys).
 */
export const MAP_DISCOVERY_CATEGORIES: Record<string, string[]> = {
  "Auto Repair": ["shop=car_repair"],
  "Barbers & Salons": ["shop=hairdresser", "shop=beauty"],
  "Restaurants": ["amenity=restaurant", "amenity=fast_food"],
  "Cafes": ["amenity=cafe"],
  "Landscaping & Gardening": ["craft=gardener"],
  "Cleaning & Laundry": ["shop=dry_cleaning", "shop=laundry"],
  "Roofers": ["craft=roofer"],
  "Plumbers": ["craft=plumber"],
  "Electricians": ["craft=electrician"],
  "Builders & Carpenters": ["craft=builder", "craft=carpenter"],
  "Car Wash": ["amenity=car_wash"],
  "Gyms & Fitness": ["leisure=fitness_centre"],
  "Dentists": ["amenity=dentist"],
  "Real Estate": ["office=estate_agent"],
};

export const MAX_DISCOVERY_RESULTS = 250;

export function buildOverpassQuery(bounds: MapBounds, selectors: string[]): string {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const clauses = selectors
    .map((selector) => {
      const [key, value] = selector.split("=");
      // Unnamed features are noise for lead generation — require a name.
      return `nwr["${key}"="${value}"]["name"](${bbox});`;
    })
    .join("\n  ");
  return `[out:json][timeout:20];\n(\n  ${clauses}\n);\nout center tags ${MAX_DISCOVERY_RESULTS};`;
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export async function fetchOverpass(query: string): Promise<OsmBusiness[]> {
  const res = await fetch(OVERPASS_URL(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Overpass request failed with status ${res.status}`);
  }
  const payload = (await res.json()) as { elements?: OverpassElement[] };
  const businesses: OsmBusiness[] = [];
  for (const el of payload.elements ?? []) {
    const name = el.tags?.name?.trim();
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || typeof lat !== "number" || typeof lng !== "number") continue;
    businesses.push({
      osmType: el.type,
      osmId: el.id,
      name,
      lat,
      lng,
      phone: el.tags?.phone ?? el.tags?.["contact:phone"] ?? undefined,
      website: el.tags?.website ?? el.tags?.["contact:website"] ?? undefined,
    });
    if (businesses.length >= MAX_DISCOVERY_RESULTS) break;
  }
  return businesses;
}

/** Nominatim policy: absolute maximum of 1 request per second. */
export const NOMINATIM_DELAY_MS = 1100;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geocodeCacheKey(city: string, state: string): string {
  return `geo:city:${state.trim().toLowerCase()}:${city.trim().toLowerCase()}`;
}

/**
 * Geocodes a (city, state) pair to its centroid via Nominatim, with a
 * long-lived Redis cache in front (fail-open when Redis is down). Callers
 * iterating multiple pairs must wait NOMINATIM_DELAY_MS between uncached
 * lookups.
 */
export async function geocodeCityState(
  city: string,
  state: string,
): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = geocodeCacheKey(city, state);
  const cached = await safeGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as { lat: number; lng: number };
    } catch {
      // fall through to a fresh lookup
    }
  }

  const params = new URLSearchParams({
    city,
    state,
    format: "jsonv2",
    limit: "1",
  });
  const res = await fetch(`${NOMINATIM_URL()}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Nominatim request failed with status ${res.status}`);
  }
  const results = (await res.json()) as Array<{ lat: string; lon: string }>;
  const first = results[0];
  if (!first) return null;
  const coords = { lat: Number(first.lat), lng: Number(first.lon) };
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;
  await safeSetEx(cacheKey, GEOCODE_CACHE_TTL_SECONDS, JSON.stringify(coords));
  return coords;
}
