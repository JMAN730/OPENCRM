import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const BYTES_PER_KILOBYTE = 1024;

type ClientReferenceManifest = {
  clientModules: Record<string, { chunks?: unknown }>;
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

  return Promise.all(
    Object.entries(ceilings).map(async ([route, ceilingKb]) => {
      const manifestPath = routeManifestPath(buildDirectory, route);

      try {
        const manifest = await readClientReferenceManifest(manifestPath, route);
        const routeChunks = clientChunks(manifest);
        const measuredBytes = await gzipSize(
          buildDirectory,
          new Set([...rootChunks, ...routeChunks]),
        );
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
        if (isMissingFile(error, manifestPath)) {
          return {
            route,
            measuredBytes: null,
            measuredKb: null,
            ceilingKb,
            status: "missing",
            passed: false,
            error: `No client-reference manifest found for ${route}`,
          };
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
  return Object.values(manifest.clientModules).flatMap((clientModule) => {
    if (!Array.isArray(clientModule.chunks)) {
      return [];
    }

    return clientModule.chunks
      .filter(
        (chunk): chunk is string =>
          typeof chunk === "string" && chunk.endsWith(".js"),
      )
      .map((chunk) => chunk.replace(/^\/_next\//, ""));
  });
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

function isMissingFile(
  error: unknown,
  expectedPath: string,
): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT" &&
    "path" in error &&
    error.path === expectedPath
  );
}
