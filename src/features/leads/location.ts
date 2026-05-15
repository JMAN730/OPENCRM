const STATE_ALIASES: Record<string, string> = {
  al: "AL",
  alabama: "AL",
  ak: "AK",
  alaska: "AK",
  az: "AZ",
  arizona: "AZ",
  ar: "AR",
  arkansas: "AR",
  ca: "CA",
  california: "CA",
  co: "CO",
  colorado: "CO",
  ct: "CT",
  connecticut: "CT",
  de: "DE",
  delaware: "DE",
  fl: "FL",
  florida: "FL",
  ga: "GA",
  georgia: "GA",
  hi: "HI",
  hawaii: "HI",
  id: "ID",
  idaho: "ID",
  il: "IL",
  illinois: "IL",
  in: "IN",
  indiana: "IN",
  ia: "IA",
  iowa: "IA",
  ks: "KS",
  kansas: "KS",
  ky: "KY",
  kentucky: "KY",
  la: "LA",
  louisiana: "LA",
  me: "ME",
  maine: "ME",
  md: "MD",
  maryland: "MD",
  ma: "MA",
  massachusetts: "MA",
  mi: "MI",
  michigan: "MI",
  mn: "MN",
  minnesota: "MN",
  ms: "MS",
  mississippi: "MS",
  mo: "MO",
  missouri: "MO",
  mt: "MT",
  montana: "MT",
  ne: "NE",
  nebraska: "NE",
  nv: "NV",
  nevada: "NV",
  nh: "NH",
  "new hampshire": "NH",
  nj: "NJ",
  "new jersey": "NJ",
  nm: "NM",
  "new mexico": "NM",
  ny: "NY",
  "new york": "NY",
  nc: "NC",
  "north carolina": "NC",
  nd: "ND",
  "north dakota": "ND",
  oh: "OH",
  ohio: "OH",
  ok: "OK",
  oklahoma: "OK",
  or: "OR",
  oregon: "OR",
  pa: "PA",
  pennsylvania: "PA",
  ri: "RI",
  "rhode island": "RI",
  sc: "SC",
  "south carolina": "SC",
  sd: "SD",
  "south dakota": "SD",
  tn: "TN",
  tennessee: "TN",
  tx: "TX",
  texas: "TX",
  ut: "UT",
  utah: "UT",
  vt: "VT",
  vermont: "VT",
  va: "VA",
  virginia: "VA",
  wa: "WA",
  washington: "WA",
  wv: "WV",
  "west virginia": "WV",
  wi: "WI",
  wisconsin: "WI",
  wy: "WY",
  wyoming: "WY",
  dc: "DC",
  "district of columbia": "DC",
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}

export function normalizeState(value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = normalizeToken(value);
  return STATE_ALIASES[normalized];
}

export function formatLocation(city?: string | null, state?: string | null): string | null {
  const cleanCity = city?.trim();
  const cleanState = normalizeState(state) ?? state?.trim().toUpperCase();
  return [cleanCity, cleanState].filter(Boolean).join(", ") || null;
}

export function parseCityState(value?: string | null): { city?: string; state?: string } {
  const clean = value?.trim();
  if (!clean) return {};

  const commaParts = clean.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const state = normalizeState(commaParts.at(-1));
    if (state) {
      return { city: commaParts.slice(0, -1).join(", "), state };
    }
  }

  for (const [alias, state] of Object.entries(STATE_ALIASES)) {
    const suffix = ` ${alias}`;
    const normalized = normalizeToken(clean);
    if (normalized.endsWith(suffix)) {
      const city = clean.slice(0, clean.length - alias.length).trim().replace(/,$/, "").trim();
      return city ? { city, state } : { state };
    }
  }

  return { city: clean };
}

export function parseLocationSearch(query?: string | null): { city?: string; state: string } | null {
  const clean = query?.trim();
  if (!clean) return null;

  const directState = normalizeState(clean);
  if (directState) return { state: directState };

  const parsed = parseCityState(clean);
  return parsed.state ? { city: parsed.city, state: parsed.state } : null;
}
