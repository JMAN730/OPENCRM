import { z } from "zod";

// Google Maps place URLs embed the pin coordinates as `!3d<lat>!4d<lng>` in
// the data segment; `/@lat,lng,zoom` is only the viewport center, so it is
// used as a fallback.
const PLACE_COORDS = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const VIEWPORT_COORDS = /\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    // (0, 0) is the classic "no data" sentinel, never a real business.
    (lat !== 0 || lng !== 0)
  );
}

export function parseLatLngFromMapsUrl(
  url: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!url) return null;
  for (const pattern of [PLACE_COORDS, VIEWPORT_COORDS]) {
    const match = url.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }
  return null;
}

export const boundsSchema = z
  .object({
    south: z.number().min(-90).max(90),
    west: z.number().min(-180).max(180),
    north: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
  })
  .refine((b) => b.south < b.north, { message: "south must be less than north" })
  .refine((b) => b.west < b.east, { message: "west must be less than east" });

export type MapBounds = z.infer<typeof boundsSchema>;

export function bboxAreaDeg2(bounds: MapBounds): number {
  return (bounds.north - bounds.south) * (bounds.east - bounds.west);
}
