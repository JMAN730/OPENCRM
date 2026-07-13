import path from "node:path";
import { describe, expect, it } from "vitest";

import { checkBundleSizes } from "./check";

const fixtureBuildDirectory = path.resolve(
  "scripts/bundle-size/__fixtures__/basic",
);

describe("checkBundleSizes", () => {
  it("passes a route whose client JavaScript is under its gzip ceiling", async () => {
    const [report] = await checkBundleSizes(fixtureBuildDirectory, {
      "/leads": 1,
    });

    expect(report).toMatchObject({
      route: "/leads",
      ceilingKb: 1,
      status: "pass",
      passed: true,
    });
  });

  it("fails an over-ceiling route with the measured and ceiling sizes", async () => {
    const [report] = await checkBundleSizes(fixtureBuildDirectory, {
      "/leads": 0.1,
    });

    expect(report).toMatchObject({
      route: "/leads",
      measuredBytes: 166,
      measuredKb: 166 / 1024,
      ceilingKb: 0.1,
      status: "fail",
      passed: false,
    });
  });

  it("reports a route missing from the build as an explicit failure", async () => {
    const [report] = await checkBundleSizes(fixtureBuildDirectory, {
      "/tasks": 1,
    });

    expect(report).toEqual({
      route: "/tasks",
      measuredBytes: null,
      measuredKb: null,
      ceilingKb: 1,
      status: "missing",
      passed: false,
      error: "No client-reference manifest found for /tasks",
    });
  });

  it("keeps gzip sizing stable for the fixed fixture chunks", async () => {
    const [report] = await checkBundleSizes(fixtureBuildDirectory, {
      "/leads": 1,
    });

    expect(report.measuredBytes).toBe(166);
    expect(report.measuredKb).toBe(166 / 1024);
  });
});
