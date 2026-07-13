/**
 * Bundle-size ratchet: fails when a mobile-critical route's client JS (gzip,
 * measured from the Turbopack client-reference manifests — see
 * docs/mobile-performance-baseline.md section 2) exceeds the ceiling
 * committed in bundle-size-ceilings.json.
 *
 * Run a production build first, then:
 *
 *   npm run check-bundle-size
 */
import path from "path";
import { readFileSync } from "fs";
import { checkBundleSizes, type Ceilings } from "@/server/bundleSize";

const buildDir = path.join(process.cwd(), ".next");
const ceilingsPath = path.join(process.cwd(), "bundle-size-ceilings.json");

const ceilings = JSON.parse(readFileSync(ceilingsPath, "utf-8")) as Ceilings;

const report = checkBundleSizes(buildDir, ceilings);

console.log("Bundle size report (client JS, gzip level 9):\n");
for (const result of report.results) {
  if (result.status === "missing") {
    console.log(`  ✗ ${result.route.padEnd(16)} MISSING from build output (ceiling ${result.ceilingKB} KB)`);
    continue;
  }
  const icon = result.status === "pass" ? "✓" : "✗";
  console.log(
    `  ${icon} ${result.route.padEnd(16)} ${result.measuredKB.toFixed(1).padStart(7)} KB / ${result.ceilingKB} KB ceiling`,
  );
}
console.log();

if (!report.ok) {
  console.error("Bundle size check FAILED.");
  process.exit(1);
}
console.log("Bundle size check passed.");
