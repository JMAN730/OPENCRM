/**
 * Bundle-size ratchet — measurement core.
 *
 * Pure module (build directory + ceilings in, per-route report out) with no
 * process spawning, so it is unit-testable against small fixture manifests.
 * A thin CLI wrapper (./cli.ts) prints the report and sets the exit code.
 *
 * Measurement method mirrors §2 of the mobile performance baseline report
 * (docs/mobile-performance-baseline.md): per-route client JS is the gzip
 * (level 9) total of the de-duplicated set of `.js` chunks the route ships —
 * the shared framework baseline (`rootMainFiles` + `polyfillFiles` from
 * build-manifest.json, present on every route), the route's own entry chunks,
 * and the lazily-loaded client-component chunks referenced by the route — all
 * read from the Turbopack client-reference manifests the production build
 * emits. Because the ratchet's reference (seeded ceilings) and its enforcement
 * use this same method, the absolute figure need not match Lighthouse's
 * first-load transfer exactly; the comparison is internally consistent.
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";

/** Per-route gzip ceilings, in whole KB. Keys are route paths, e.g. "/leads". */
export interface Ceilings {
  /** Human-readable tightening policy (ignored by the checker). */
  policy?: string;
  routes: Record<string, number>;
}

export type RouteStatus = "pass" | "fail" | "missing";

export interface RouteReport {
  route: string;
  /** Measured gzip size in KB, or null when the route is absent from the build. */
  measuredKB: number | null;
  ceilingKB: number;
  status: RouteStatus;
}

export interface BundleReport {
  routes: RouteReport[];
  /** False when any route exceeds its ceiling or is missing from the build. */
  ok: boolean;
}

/** "/leads" -> "leads"; "/" (or "") -> "" (the root page). */
export function routeToSegment(route: string): string {
  return route.replace(/^\/+/, "").replace(/\/+$/, "");
}

/** Turbopack lists chunks as "/_next/static/..." or "static/..."; normalize to
 *  a path relative to the build directory. */
export function normalizeChunk(chunk: string): string {
  return chunk.replace(/^\/_next\//, "").replace(/^\/+/, "");
}

function clientReferenceManifestPath(buildDir: string, segment: string): string {
  return path.join(
    buildDir,
    "server",
    "app",
    ...(segment ? segment.split("/") : []),
    "page_client-reference-manifest.js",
  );
}

interface ClientReferenceManifest {
  clientModules: Record<string, { chunks?: string[] }>;
  entryJSFiles: Record<string, string[]>;
}

/** Parse the single `globalThis.__RSC_MANIFEST[...] = {...}` assignment. The
 *  right-hand side is JSON (Next serializes it with JSON.stringify), so it is
 *  parsed rather than executed. */
export function parseClientReferenceManifest(source: string): ClientReferenceManifest {
  const match = source.match(
    /globalThis\.__RSC_MANIFEST\[(?:"|')(?:.+?)(?:"|')\]\s*=\s*(\{[\s\S]*\});?\s*$/,
  );
  if (!match) {
    throw new Error("Could not locate a __RSC_MANIFEST assignment in manifest");
  }
  return JSON.parse(match[1]) as ClientReferenceManifest;
}

/** Shared framework chunks shipped on every route (build-manifest.json). */
export function readSharedChunks(buildDir: string): string[] {
  const manifestPath = path.join(buildDir, "build-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    rootMainFiles?: string[];
    polyfillFiles?: string[];
  };
  return [...(manifest.rootMainFiles ?? []), ...(manifest.polyfillFiles ?? [])]
    .filter((c) => c.endsWith(".js"))
    .map(normalizeChunk);
}

/**
 * The de-duplicated set of `.js` chunks a route ships: shared framework +
 * route entry chunks + lazily-referenced client-component chunks.
 *
 * Returns null when the route has no client-reference manifest or no entry for
 * its page in the build (i.e. the route is absent from the build output).
 */
export function collectRouteChunks(buildDir: string, route: string): string[] | null {
  const segment = routeToSegment(route);
  const manifestPath = clientReferenceManifestPath(buildDir, segment);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  const manifest = parseClientReferenceManifest(fs.readFileSync(manifestPath, "utf8"));
  const entryKey = `[project]/src/app/${segment ? `${segment}/` : ""}page`;
  const entryFiles = manifest.entryJSFiles?.[entryKey];
  if (!entryFiles) {
    return null;
  }

  const chunks = new Set<string>(readSharedChunks(buildDir));
  for (const file of entryFiles) {
    if (file.endsWith(".js")) chunks.add(normalizeChunk(file));
  }
  for (const mod of Object.values(manifest.clientModules ?? {})) {
    for (const chunk of mod.chunks ?? []) {
      if (typeof chunk === "string" && chunk.endsWith(".js")) {
        chunks.add(normalizeChunk(chunk));
      }
    }
  }
  return [...chunks];
}

/** Gzip (level 9) total, in bytes, of a set of chunks resolved under buildDir. */
export function gzipTotalBytes(buildDir: string, chunks: string[]): number {
  let total = 0;
  for (const chunk of chunks) {
    const filePath = path.join(buildDir, chunk);
    total += zlib.gzipSync(fs.readFileSync(filePath), { level: 9 }).length;
  }
  return total;
}

/** Measured client-JS gzip size for a route, in KB, or null if absent. */
export function measureRouteKB(buildDir: string, route: string): number | null {
  const chunks = collectRouteChunks(buildDir, route);
  if (chunks === null) return null;
  return gzipTotalBytes(buildDir, chunks) / 1024;
}

/**
 * Compare each ceiling route's measured size against its ceiling.
 * `ok` is false if any route is over its ceiling or missing from the build.
 */
export function checkBundleSizes(buildDir: string, ceilings: Ceilings): BundleReport {
  const routes: RouteReport[] = Object.entries(ceilings.routes).map(([route, ceilingKB]) => {
    const measuredKB = measureRouteKB(buildDir, route);
    let status: RouteStatus;
    if (measuredKB === null) {
      status = "missing";
    } else if (measuredKB > ceilingKB) {
      status = "fail";
    } else {
      status = "pass";
    }
    return { route, measuredKB, ceilingKB, status };
  });

  return { routes, ok: routes.every((r) => r.status === "pass") };
}

/** Render a per-route report table naming route, measured size, and ceiling. */
export function formatReport(report: BundleReport): string {
  const lines = [
    "Bundle-size ratchet — client JS per route (gzip):",
    "",
    "  Route            Measured    Ceiling   Result",
    "  ---------------- ---------- ---------- ------",
  ];
  for (const r of report.routes) {
    const measured = r.measuredKB === null ? "    —    " : `${r.measuredKB.toFixed(1)} KB`;
    const ceiling = `${r.ceilingKB} KB`;
    const result =
      r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL (over ceiling)" : "MISSING (not in build)";
    lines.push(`  ${r.route.padEnd(16)} ${measured.padStart(9)} ${ceiling.padStart(9)}  ${result}`);
  }
  lines.push("");
  lines.push(report.ok ? "All routes within ceiling." : "One or more routes failed the ratchet.");
  return lines.join("\n");
}
