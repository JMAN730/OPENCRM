import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const BYTES_PER_KILOBYTE = 1024;

type ClientReferenceManifest = {
  clientModules: Record<string, { chunks?: unknown }>;
  entryJSFiles?: Record<string, unknown>;
};

type BuildManifest = {
  rootMainFiles: unknown;
};

export type BundleSizeCeilings = Record<string, number>;

export type RouteBundleReport = {
  route: string;
  measuredBytes: number | null;
  measuredKb: number | null;
  ceilingKb: number;
  status: "pass" | "fail" | "missing";
  passed: boolean;
  error?: string;
};

export async function checkBundleSizes(
  buildDirectory: string,
  ceilings: BundleSizeCeilings,
): Promise<RouteBundleReport[]> {
  const rootChunks = await readRootChunks(buildDirectory);
  const rootChunkSet = new Set(rootChunks);
  let rootBytes: number;

  try {
    rootBytes = await gzipSize(buildDirectory, rootChunkSet);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }

    return Object.entries(ceilings).map(([route, ceilingKb]) =>
      missingReport(
        route,
        ceilingKb,
        routeManifestPath(buildDirectory, route),
        error,
      ),
    );
  }

  return Promise.all(
    Object.entries(ceilings).map(async ([route, ceilingKb]) => {
      const manifestPath = routeManifestPath(buildDirectory, route);

      try {
        const manifest = await readClientReferenceManifest(manifestPath, route);
        const routeChunks = new Set(
          clientChunks(manifest).filter((chunk) => !rootChunkSet.has(chunk)),
        );
        const routeBytes = await gzipSize(buildDirectory, routeChunks);
        const measuredBytes = rootBytes + routeBytes;
        const passed = measuredBytes <= ceilingKb * BYTES_PER_KILOBYTE;

        return {
          route,
          measuredBytes,
          measuredKb: measuredBytes / BYTES_PER_KILOBYTE,
          ceilingKb,
          status: passed ? "pass" : "fail",
          passed,
        };
      } catch (error) {
        if (isMissingFile(error)) {
          return missingReport(route, ceilingKb, manifestPath, error);
        }

        throw error;
      }
    }),
  );
}

async function readRootChunks(buildDirectory: string): Promise<string[]> {
  const buildManifestPath = path.join(buildDirectory, "build-manifest.json");
  const manifest = JSON.parse(
    await readFile(buildManifestPath, "utf8"),
  ) as BuildManifest;

  if (!Array.isArray(manifest.rootMainFiles)) {
    throw new Error(`${buildManifestPath} does not contain rootMainFiles`);
  }

  return manifest.rootMainFiles.filter(
    (chunk): chunk is string => typeof chunk === "string" && chunk.endsWith(".js"),
  );
}

async function readClientReferenceManifest(
  manifestPath: string,
  route: string,
): Promise<ClientReferenceManifest> {
  const source = await readFile(manifestPath, "utf8");
  const manifestKey = route === "/" ? "/page" : `${route}/page`;
  const assignment = `globalThis.__RSC_MANIFEST[${JSON.stringify(manifestKey)}]`;
  const assignmentStart = source.indexOf(assignment);
  const valueStart = source.indexOf("=", assignmentStart) + 1;
  const valueEnd = source.lastIndexOf(";");

  if (assignmentStart === -1 || valueStart === 0 || valueEnd < valueStart) {
    throw new Error(`${manifestPath} has an unsupported manifest format`);
  }

  const manifest = JSON.parse(
    source.slice(valueStart, valueEnd).trim(),
  ) as ClientReferenceManifest;

  if (!manifest.clientModules || typeof manifest.clientModules !== "object") {
    throw new Error(`${manifestPath} does not contain clientModules`);
  }

  return manifest;
}

function clientChunks(manifest: ClientReferenceManifest): string[] {
  const moduleChunks = Object.values(manifest.clientModules).flatMap(
    (clientModule) => normalizeClientChunks(clientModule.chunks),
  );
  const entryChunks = Object.values(manifest.entryJSFiles ?? {}).flatMap(
    normalizeClientChunks,
  );

  return [...moduleChunks, ...entryChunks];
}

function normalizeClientChunks(chunks: unknown): string[] {
  if (!Array.isArray(chunks)) {
    return [];
  }

  return chunks
    .filter(
      (chunk): chunk is string =>
        typeof chunk === "string" && chunk.endsWith(".js"),
    )
    .map((chunk) => chunk.replace(/^\/_next\//, ""));
}

async function gzipSize(
  buildDirectory: string,
  chunks: Set<string>,
): Promise<number> {
  const sizes = await Promise.all(
    [...chunks].map(async (chunk) => {
      const contents = await readFile(path.join(buildDirectory, chunk));
      return gzipSync(contents, { level: 9 }).byteLength;
    }),
  );

  return sizes.reduce((total, size) => total + size, 0);
}

function routeManifestPath(buildDirectory: string, route: string): string {
  const routeDirectory = route === "/" ? "" : route.replace(/^\//, "");
  return path.join(
    buildDirectory,
    "server",
    "app",
    routeDirectory,
    "page_client-reference-manifest.js",
  );
}

function missingReport(
  route: string,
  ceilingKb: number,
  manifestPath: string,
  error: NodeJS.ErrnoException,
): RouteBundleReport {
  return {
    route,
    measuredBytes: null,
    measuredKb: null,
    ceilingKb,
    status: "missing",
    passed: false,
    error:
      error.path === manifestPath
        ? `No client-reference manifest found for ${route}`
        : `Missing chunk for ${route}: ${error.path ?? "unknown path"}`,
  };
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
