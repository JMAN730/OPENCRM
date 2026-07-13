import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import {
  checkBundleSizes,
  collectRouteChunks,
  formatReport,
  measureRouteKB,
  normalizeChunk,
  parseClientReferenceManifest,
  routeToSegment,
  type Ceilings,
} from "./measure";

// --- fixture builder -------------------------------------------------------
//
// Writes a minimal Turbopack-shaped build tree into a temp dir: a
// build-manifest.json (shared framework chunks), a per-route
// page_client-reference-manifest.js, and the referenced chunk files.

interface RouteFixture {
  segment: string; // e.g. "leads"
  entryChunks: string[]; // relative paths, e.g. "static/chunks/entry.js"
  lazyChunks?: string[]; // referenced by clientModules
}

function writeChunk(buildDir: string, chunk: string, content: string) {
  const filePath = path.join(buildDir, normalizeChunk(chunk));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function buildFixture(
  buildDir: string,
  opts: {
    sharedChunks: Record<string, string>;
    routes: RouteFixture[];
    chunkContents: Record<string, string>;
  },
) {
  // build-manifest.json
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(
    path.join(buildDir, "build-manifest.json"),
    JSON.stringify({
      rootMainFiles: Object.keys(opts.sharedChunks),
      polyfillFiles: [],
    }),
  );
  for (const [chunk, content] of Object.entries(opts.sharedChunks)) {
    writeChunk(buildDir, chunk, content);
  }

  // per-route manifests + chunk files
  for (const route of opts.routes) {
    const entryKey = `[project]/src/app/${route.segment}/page`;
    const clientModules: Record<string, { chunks: string[] }> = {};
    for (const [i, chunk] of (route.lazyChunks ?? []).entries()) {
      clientModules[`mod-${route.segment}-${i}`] = { chunks: [chunk] };
    }
    const manifest = {
      clientModules,
      entryJSFiles: { [entryKey]: route.entryChunks },
    };
    const manifestPath = path.join(
      buildDir,
      "server",
      "app",
      route.segment,
      "page_client-reference-manifest.js",
    );
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(
      manifestPath,
      `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n` +
        `globalThis.__RSC_MANIFEST[${JSON.stringify(`/${route.segment}/page`)}] = ${JSON.stringify(
          manifest,
        )};`,
    );
    for (const chunk of [...route.entryChunks, ...(route.lazyChunks ?? [])]) {
      if (opts.chunkContents[chunk] !== undefined) {
        writeChunk(buildDir, chunk, opts.chunkContents[chunk]);
      }
    }
  }
}

/** Sum of gzip level-9 sizes of a set of unique files — the reference the
 *  module's method must reproduce. */
function expectedGzipKB(buildDir: string, chunks: string[]): number {
  let total = 0;
  for (const chunk of new Set(chunks)) {
    total += zlib.gzipSync(fs.readFileSync(path.join(buildDir, normalizeChunk(chunk))), {
      level: 9,
    }).length;
  }
  return total / 1024;
}

let buildDir: string;

beforeEach(() => {
  buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-check-"));
});

afterEach(() => {
  fs.rmSync(buildDir, { recursive: true, force: true });
});

// --- pure helpers ----------------------------------------------------------

describe("routeToSegment", () => {
  it("strips leading and trailing slashes", () => {
    expect(routeToSegment("/leads")).toBe("leads");
    expect(routeToSegment("leads/")).toBe("leads");
    expect(routeToSegment("/")).toBe("");
  });
});

describe("normalizeChunk", () => {
  it("normalizes both Turbopack chunk path shapes to build-relative", () => {
    expect(normalizeChunk("/_next/static/chunks/a.js")).toBe("static/chunks/a.js");
    expect(normalizeChunk("static/chunks/a.js")).toBe("static/chunks/a.js");
    expect(normalizeChunk("/static/chunks/a.js")).toBe("static/chunks/a.js");
  });
});

describe("parseClientReferenceManifest", () => {
  it("parses the JSON right-hand side of the __RSC_MANIFEST assignment", () => {
    const src =
      `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n` +
      `globalThis.__RSC_MANIFEST["/leads/page"] = {"clientModules":{},"entryJSFiles":{"x":["static/chunks/a.js"]}};`;
    const parsed = parseClientReferenceManifest(src);
    expect(parsed.entryJSFiles.x).toEqual(["static/chunks/a.js"]);
  });

  it("throws when no manifest assignment is present", () => {
    expect(() => parseClientReferenceManifest("console.log(1)")).toThrow();
  });
});

// --- measurement -----------------------------------------------------------

describe("collectRouteChunks", () => {
  it("unions shared + entry + lazy chunks and de-duplicates", () => {
    buildFixture(buildDir, {
      sharedChunks: { "static/chunks/framework.js": "framework-code" },
      routes: [
        {
          segment: "leads",
          // entry re-references the shared framework chunk (must not double count)
          entryChunks: ["static/chunks/framework.js", "static/chunks/leads-entry.js"],
          // lazy re-references the entry chunk (must not double count)
          lazyChunks: ["static/chunks/leads-modal.js", "/_next/static/chunks/leads-entry.js"],
        },
      ],
      chunkContents: {
        "static/chunks/leads-entry.js": "leads-entry-code",
        "static/chunks/leads-modal.js": "leads-modal-code",
      },
    });

    const chunks = collectRouteChunks(buildDir, "/leads");
    expect(chunks).not.toBeNull();
    expect(new Set(chunks)).toEqual(
      new Set([
        "static/chunks/framework.js",
        "static/chunks/leads-entry.js",
        "static/chunks/leads-modal.js",
      ]),
    );
  });

  it("returns null when the route's manifest is absent from the build", () => {
    buildFixture(buildDir, {
      sharedChunks: { "static/chunks/framework.js": "framework-code" },
      routes: [],
      chunkContents: {},
    });
    expect(collectRouteChunks(buildDir, "/leads")).toBeNull();
  });
});

describe("measureRouteKB — gzip sizing", () => {
  it("sums gzip level-9 sizes of the unique route chunks", () => {
    buildFixture(buildDir, {
      sharedChunks: { "static/chunks/framework.js": "x".repeat(2000) },
      routes: [
        {
          segment: "leads",
          entryChunks: ["static/chunks/framework.js", "static/chunks/leads-entry.js"],
          lazyChunks: ["static/chunks/leads-modal.js"],
        },
      ],
      chunkContents: {
        "static/chunks/leads-entry.js": "console.log('leads');".repeat(50),
        "static/chunks/leads-modal.js": "export const modal = 1;".repeat(80),
      },
    });

    const measured = measureRouteKB(buildDir, "/leads")!;
    const expected = expectedGzipKB(buildDir, [
      "static/chunks/framework.js",
      "static/chunks/leads-entry.js",
      "static/chunks/leads-modal.js",
    ]);
    expect(measured).toBeCloseTo(expected, 6);
  });

  it("is stable across repeated measurements of a fixed fixture", () => {
    buildFixture(buildDir, {
      sharedChunks: { "static/chunks/framework.js": "abcdefgh".repeat(500) },
      routes: [{ segment: "tasks", entryChunks: ["static/chunks/framework.js"] }],
      chunkContents: {},
    });
    const first = measureRouteKB(buildDir, "/tasks");
    const second = measureRouteKB(buildDir, "/tasks");
    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });
});

// --- checkBundleSizes ------------------------------------------------------

function fixtureWithSizedRoute(segment: string, rawBytes: number) {
  buildFixture(buildDir, {
    sharedChunks: { "static/chunks/framework.js": "f" },
    routes: [
      {
        segment,
        entryChunks: ["static/chunks/framework.js", `static/chunks/${segment}.js`],
      },
    ],
    // Random-ish incompressible content so gzip size ~ rawBytes and we can
    // straddle a ceiling deterministically.
    chunkContents: {
      [`static/chunks/${segment}.js`]: Array.from({ length: rawBytes }, (_, i) =>
        String.fromCharCode(33 + ((i * 7 + (i % 13)) % 90)),
      ).join(""),
    },
  });
}

describe("checkBundleSizes", () => {
  it("passes when a route is under its ceiling", () => {
    fixtureWithSizedRoute("leads", 1024);
    const measured = measureRouteKB(buildDir, "/leads")!;
    const ceilings: Ceilings = { routes: { "/leads": Math.ceil(measured) + 5 } };

    const report = checkBundleSizes(buildDir, ceilings);
    expect(report.ok).toBe(true);
    expect(report.routes[0].status).toBe("pass");
    expect(report.routes[0].measuredKB).toBeCloseTo(measured, 6);
  });

  it("fails and reports measured vs ceiling when a route is over its ceiling", () => {
    fixtureWithSizedRoute("leads", 4096);
    const measured = measureRouteKB(buildDir, "/leads")!;
    const ceilingKB = Math.floor(measured) - 1; // force over-ceiling
    const ceilings: Ceilings = { routes: { "/leads": ceilingKB } };

    const report = checkBundleSizes(buildDir, ceilings);
    expect(report.ok).toBe(false);
    const route = report.routes[0];
    expect(route.status).toBe("fail");
    expect(route.ceilingKB).toBe(ceilingKB);
    expect(route.measuredKB).toBeGreaterThan(route.ceilingKB);
  });

  it("treats a ceiling route absent from the build as an explicit failure, not a skip", () => {
    fixtureWithSizedRoute("leads", 1024);
    const ceilings: Ceilings = {
      routes: { "/leads": 999, "/tasks": 999 }, // /tasks never built
    };

    const report = checkBundleSizes(buildDir, ceilings);
    expect(report.ok).toBe(false);
    const tasks = report.routes.find((r) => r.route === "/tasks")!;
    expect(tasks.status).toBe("missing");
    expect(tasks.measuredKB).toBeNull();
  });
});

describe("formatReport", () => {
  it("names route, measured size, ceiling, and result for each row", () => {
    const out = formatReport({
      ok: false,
      routes: [
        { route: "/leads", measuredKB: 297.7, ceilingKB: 304, status: "pass" },
        { route: "/tasks", measuredKB: 290.4, ceilingKB: 284, status: "fail" },
        { route: "/dashboard", measuredKB: null, ceilingKB: 282, status: "missing" },
      ],
    });
    expect(out).toContain("/leads");
    expect(out).toContain("297.7 KB");
    expect(out).toContain("304 KB");
    expect(out).toContain("PASS");
    expect(out).toContain("FAIL");
    expect(out).toContain("MISSING");
    expect(out).toContain("One or more routes failed the ratchet.");
  });
});
