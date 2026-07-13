import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { checkBundleSizes, measureRouteGzipKB, type Ceilings } from "./bundleSize";

/**
 * Writes a minimal Turbopack-shaped build directory:
 *   <dir>/build-manifest.json
 *   <dir>/server/app/<route>/page_client-reference-manifest.js
 *   <dir>/static/chunks/*.js
 *
 * `chunkContents` maps chunk filename -> file contents; every chunk is
 * referenced by one clientModule entry in the route's manifest, matching
 * how Turbopack emits them.
 */
function writeFixtureRoute(
  buildDir: string,
  route: string,
  chunkContents: Record<string, string>,
) {
  const chunksDir = path.join(buildDir, "static", "chunks");
  fs.mkdirSync(chunksDir, { recursive: true });
  const chunkPaths: string[] = [];
  for (const [name, contents] of Object.entries(chunkContents)) {
    fs.writeFileSync(path.join(chunksDir, name), contents);
    chunkPaths.push(`/_next/static/chunks/${name}`);
  }

  const manifest = {
    clientModules: {
      "[project]/fixture/module.js": { chunks: chunkPaths },
    },
  };

  const routeDir = path.join(buildDir, "server", "app", ...route.replace(/^\/+/, "").split("/"));
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(
    path.join(routeDir, "page_client-reference-manifest.js"),
    `globalThis.__RSC_MANIFEST=globalThis.__RSC_MANIFEST||{};\nglobalThis.__RSC_MANIFEST["${route}/page"]=${JSON.stringify(manifest)};\n`,
  );
}

function writeBuildManifest(buildDir: string, rootMainFiles: string[] = []) {
  fs.writeFileSync(
    path.join(buildDir, "build-manifest.json"),
    JSON.stringify({ rootMainFiles }),
  );
}

const ceilings = (routes: Record<string, number>): Ceilings => ({
  policy: "test policy",
  routes,
});

describe("bundleSize", () => {
  let buildDir: string;

  beforeEach(() => {
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-size-test-"));
  });

  afterEach(() => {
    fs.rmSync(buildDir, { recursive: true, force: true });
  });

  it("passes a route whose measured gzip size is under its ceiling", () => {
    writeBuildManifest(buildDir);
    writeFixtureRoute(buildDir, "/dashboard", { "a.js": "x".repeat(1000) });

    const report = checkBundleSizes(buildDir, ceilings({ "/dashboard": 999 }));

    expect(report.ok).toBe(true);
    expect(report.results).toEqual([
      { route: "/dashboard", status: "pass", measuredKB: expect.any(Number), ceilingKB: 999 },
    ]);
    const [result] = report.results;
    if (result.status !== "missing") {
      expect(result.measuredKB).toBeLessThan(999);
    }
  });

  it("fails a route whose measured gzip size exceeds its ceiling, reporting exact numbers", () => {
    writeBuildManifest(buildDir);
    // "x".repeat(1000) gzips (level 9) well under 1 KB.
    writeFixtureRoute(buildDir, "/leads", { "a.js": "x".repeat(1000) });

    const expectedKB = measureRouteGzipKB(buildDir, "/leads");
    const tinyCeiling = Math.max(0, expectedKB - 0.1);

    const report = checkBundleSizes(buildDir, ceilings({ "/leads": tinyCeiling }));

    expect(report.ok).toBe(false);
    expect(report.results).toEqual([
      { route: "/leads", status: "fail", measuredKB: expectedKB, ceilingKB: tinyCeiling },
    ]);
  });

  it("reports a route missing from the build output as an explicit failure, not a skip", () => {
    writeBuildManifest(buildDir);
    // No manifest written for /tasks at all.

    const report = checkBundleSizes(buildDir, ceilings({ "/tasks": 250 }));

    expect(report.ok).toBe(false);
    expect(report.results).toEqual([{ route: "/tasks", status: "missing", ceilingKB: 250 }]);
  });

  it("reports pass/fail independently per route in a multi-route ceilings file", () => {
    writeBuildManifest(buildDir);
    writeFixtureRoute(buildDir, "/dashboard", { "a.js": "x".repeat(1000) });
    // /tasks intentionally has no manifest -> missing.

    const report = checkBundleSizes(
      buildDir,
      ceilings({ "/dashboard": 999, "/tasks": 250 }),
    );

    expect(report.ok).toBe(false);
    expect(report.results.find((r) => r.route === "/dashboard")?.status).toBe("pass");
    expect(report.results.find((r) => r.route === "/tasks")?.status).toBe("missing");
  });

  it("produces a stable, independently-verifiable gzip size for a fixed fixture", () => {
    writeBuildManifest(buildDir);
    const contents = "console.log('fixed fixture content');\n".repeat(50);
    writeFixtureRoute(buildDir, "/dashboard", { "a.js": contents });

    const expectedBytes = zlib.gzipSync(Buffer.from(contents), { level: 9 }).length;
    const measured = measureRouteGzipKB(buildDir, "/dashboard");

    expect(measured).toBeCloseTo(expectedBytes / 1024, 10);
    // Re-measuring is deterministic.
    expect(measureRouteGzipKB(buildDir, "/dashboard")).toBe(measured);
  });

  it("includes root main files (framework baseline) shared across every route", () => {
    const rootFile = path.join(buildDir, "static", "chunks", "root.js");
    fs.mkdirSync(path.dirname(rootFile), { recursive: true });
    fs.writeFileSync(rootFile, "root".repeat(500));
    writeBuildManifest(buildDir, ["static/chunks/root.js"]);
    writeFixtureRoute(buildDir, "/dashboard", { "a.js": "x".repeat(1000) });

    const withRoot = measureRouteGzipKB(buildDir, "/dashboard");

    // Same route, no root main files, is measurably smaller.
    const buildDirNoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-size-test-noroot-"));
    writeBuildManifest(buildDirNoRoot);
    writeFixtureRoute(buildDirNoRoot, "/dashboard", { "a.js": "x".repeat(1000) });
    const withoutRoot = measureRouteGzipKB(buildDirNoRoot, "/dashboard");
    fs.rmSync(buildDirNoRoot, { recursive: true, force: true });

    expect(withRoot).toBeGreaterThan(withoutRoot);
  });

  it("de-duplicates a chunk referenced by multiple client modules", () => {
    const chunksDir = path.join(buildDir, "static", "chunks");
    fs.mkdirSync(chunksDir, { recursive: true });
    fs.writeFileSync(path.join(chunksDir, "shared.js"), "shared".repeat(500));
    writeBuildManifest(buildDir);

    const manifest = {
      clientModules: {
        "[project]/fixture/a.js": { chunks: ["/_next/static/chunks/shared.js"] },
        "[project]/fixture/b.js": { chunks: ["/_next/static/chunks/shared.js"] },
      },
    };
    const routeDir = path.join(buildDir, "server", "app", "dashboard");
    fs.mkdirSync(routeDir, { recursive: true });
    fs.writeFileSync(
      path.join(routeDir, "page_client-reference-manifest.js"),
      `globalThis.__RSC_MANIFEST=globalThis.__RSC_MANIFEST||{};\nglobalThis.__RSC_MANIFEST["/dashboard/page"]=${JSON.stringify(manifest)};\n`,
    );

    const measured = measureRouteGzipKB(buildDir, "/dashboard");
    const expectedBytes = zlib.gzipSync(Buffer.from("shared".repeat(500)), { level: 9 }).length;

    expect(measured).toBeCloseTo(expectedBytes / 1024, 10);
  });
});
