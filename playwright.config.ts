import path from "path";
import { defineConfig, devices } from "@playwright/test";

process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(__dirname, ".playwright");

const webServer =
  process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
    ? undefined
    : {
        command:
          'powershell -NoLogo -NoProfile -Command "New-Item -ItemType Directory -Force \'.next\\standalone\\.next\\static\' | Out-Null; Copy-Item -Recurse -Force \'.next\\static\\*\' \'.next\\standalone\\.next\\static\'; $env:PORT=\'3100\'; $env:HOSTNAME=\'127.0.0.1\'; node \'.next/standalone/server.js\'"',
        url: "http://127.0.0.1:3100",
        reuseExistingServer: false,
        stdout: "pipe" as const,
        stderr: "pipe" as const,
        timeout: 120_000,
      };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer,
});
