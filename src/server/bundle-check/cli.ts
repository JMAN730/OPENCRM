/**
 * Bundle-size ratchet — CLI wrapper.
 *
 * Thin front-end over ./measure.ts: reads an existing production build and the
 * committed ceilings file, prints the per-route report, and exits nonzero if
 * any route exceeds its ceiling or is missing from the build. Run after a
 * production build (`npm run build`), locally or in CI.
 *
 *   npm run bundle:check                     # against .next + bundle-size.config.json
 *   tsx src/server/bundle-check/cli.ts --build-dir .next --ceilings bundle-size.config.json
 */

import fs from "fs";
import path from "path";
import { checkBundleSizes, formatReport, type Ceilings } from "./measure";

function parseArgs(argv: string[]): { buildDir: string; ceilingsPath: string } {
  let buildDir = ".next";
  let ceilingsPath = "bundle-size.config.json";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--build-dir") buildDir = argv[++i];
    else if (arg === "--ceilings") ceilingsPath = argv[++i];
  }
  return { buildDir, ceilingsPath };
}

function main(): void {
  const { buildDir, ceilingsPath } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(path.join(buildDir, "build-manifest.json"))) {
    console.error(
      `No production build found at "${buildDir}". Run \`npm run build\` before the bundle-size check.`,
    );
    process.exit(1);
  }

  const ceilings = JSON.parse(fs.readFileSync(ceilingsPath, "utf8")) as Ceilings;
  const report = checkBundleSizes(buildDir, ceilings);

  console.log(formatReport(report));
  process.exit(report.ok ? 0 : 1);
}

main();
