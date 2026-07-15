import path from "node:path";

import ceilingDefinition from "../bundle-size-ceilings.json";
import { checkBundleSizes } from "./bundle-size/check";

async function main(): Promise<void> {
  const buildDirectory = path.resolve(process.argv[2] ?? ".next");
  const reports = await checkBundleSizes(
    buildDirectory,
    ceilingDefinition.routes,
  );

  console.log("Route        Measured gzip KB   Ceiling KB   Result");

  for (const report of reports) {
    const measured =
      report.measuredKb === null ? "missing" : report.measuredKb.toFixed(1);
    const result = report.passed ? "PASS" : "FAIL";

    console.log(
      `${report.route.padEnd(12)} ${measured.padStart(16)} ${report.ceilingKb
        .toFixed(1)
        .padStart(12)}   ${result}`,
    );

    if (report.error) {
      console.log(`  ${report.error}`);
    }
  }

  if (reports.some((report) => !report.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
