// Defensive input sanitisation for scraper inputs. These values flow into
// the Python subprocess as CLI args / file contents, so we strip anything
// that could be interpreted as shell metacharacters even though we always
// spawn with an argv array (no shell). Belt + suspenders.

const LOCATION_RE = /^[A-Za-z0-9 ,.'\-()/&]+$/;

export function sanitizeLocation(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) {
    throw new Error("Location is empty");
  }
  if (trimmed.length > 120) {
    throw new Error(`Location too long (max 120 chars): ${trimmed.slice(0, 40)}…`);
  }
  if (!LOCATION_RE.test(trimmed)) {
    throw new Error(
      `Location contains disallowed characters: ${trimmed}. ` +
        `Only letters, digits, spaces, commas, periods, apostrophes, hyphens, parentheses, slashes, and ampersands are allowed.`
    );
  }
  return trimmed;
}

export function sanitizeLocations(rawList: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawList) {
    const clean = sanitizeLocation(raw);
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  if (out.length === 0) {
    throw new Error("At least one valid location is required.");
  }
  return out;
}

export function parseLocationsBlob(blob: string): string[] {
  return blob
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
