import { existsSync, readFileSync } from "fs";
import path from "path";
import zlib from "zlib";

/**
 * Per-route gzip-KB ceilings, plus the tightening policy that explains them.
 * Loaded from `bundle-size-ceilings.json` at the repo root by the CLI wrapper
 * (scripts/check-bundle-size.ts).
 */
export type Ceilings = {
  policy: string;
  routes: Record<string, number>;
};

export type RouteResult =
  | { route: string; status: "pass"; measuredKB: number; ceilingKB: number }
  | { route: string; status: "fail"; measuredKB: number; ceilingKB: number }
  | { route: string; status: "missing"; ceilingKB: number };

export type BundleSizeReport = {
  results: RouteResult[];
  ok: boolean;
};

type ClientReferenceManifest = {
  clientModules: Record<string, { chunks?: string[] }>;
};

const MANIFEST_ASSIGNMENT = /globalThis\.__RSC_MANIFEST\[("(?:[^"\\]|\\.)*")\]\s*=\s*(\{[\s\S]*\});?\s*$/m;

function manifestPathForRoute(buildDir: string, route: string): string {
  const segments = route.replace(/^\/+/, "").split("/").filter(Boolean);
  return path.join(buildDir, "server", "app", ...segments, "page_client-reference-manifest.js");
}

function parseClientReferenceManifest(source: string, manifestPath: string): ClientReferenceManifest {
  const match = source.match(MANIFEST_ASSIGNMENT);
  if (!match) {
    throw new Error(`Could not parse Turbopack client-reference manifest: ${manifestPath}`);
  }
  return JSON.parse(match[2]) as ClientReferenceManifest;
}

/** Chunk paths in the manifest are web paths like "/_next/static/chunks/x.js". */
function chunkPathToBuildFile(buildDir: string, chunkPath: string): string {
  return path.join(buildDir, chunkPath.replace(/^\/_next\//, ""));
}

/**
 * Root-level chunks (React DOM + Next.js runtime) that every route loads.
 * Turbopack lists these once in build-manifest.json rather than repeating
 * them in each route's client-reference manifest.
 */
function rootMainFiles(buildDir: string): string[] {
  const buildManifestPath = path.join(buildDir, "build-manifest.json");
  if (!existsSync(buildManifestPath)) return [];
  const buildManifest = JSON.parse(readFileSync(buildManifestPath, "utf-8")) as {
    rootMainFiles?: string[];
  };
  return (buildManifest.rootMainFiles ?? []).map((f) => path.join(buildDir, f));
}

function gzipKB(filePath: string): number {
  const gzipped = zlib.gzipSync(readFileSync(filePath), { level: 9 });
  return gzipped.length / 1024;
}

/**
 * Client-JS gzip size for one route: root main files (framework baseline,
 * present on every page) plus every chunk referenced by the route's
 * Turbopack client-reference manifest, including chunks that are only
 * loaded lazily. This matches the method documented in
 * docs/mobile-performance-baseline.md section 2.
 *
 * Throws if the route has no client-reference manifest in `buildDir` — the
 * caller (checkBundleSizes) checks existence first so this only throws on a
 * malformed manifest, not a missing route.
 */
export function measureRouteGzipKB(buildDir: string, route: string): number {
  const manifestPath = manifestPathForRoute(buildDir, route);
  const source = readFileSync(manifestPath, "utf-8");
  const manifest = parseClientReferenceManifest(source, manifestPath);

  const files = new Set<string>(rootMainFiles(buildDir));
  for (const clientModule of Object.values(manifest.clientModules)) {
    for (const chunk of clientModule.chunks ?? []) {
      files.add(chunkPathToBuildFile(buildDir, chunk));
    }
  }

  let totalKB = 0;
  for (const file of files) {
    if (existsSync(file)) totalKB += gzipKB(file);
  }
  return totalKB;
}

/**
 * Pure entry point: build directory + ceilings in, per-route report out.
 * A route in `ceilings.routes` with no manifest in `buildDir` is reported as
 * "missing" rather than silently skipped.
 */
export function checkBundleSizes(buildDir: string, ceilings: Ceilings): BundleSizeReport {
  const results: RouteResult[] = Object.entries(ceilings.routes).map(([route, ceilingKB]) => {
    const manifestPath = manifestPathForRoute(buildDir, route);
    if (!existsSync(manifestPath)) {
      return { route, status: "missing", ceilingKB };
    }
    const measuredKB = measureRouteGzipKB(buildDir, route);
    return {
      route,
      status: measuredKB <= ceilingKB ? "pass" : "fail",
      measuredKB,
      ceilingKB,
    };
  });

  return { results, ok: results.every((r) => r.status === "pass") };
}
