import path from "path";

const REPO_ROOT = process.cwd();

export const scraperConfig = {
  pythonPath: process.env.SCRAPER_PYTHON_PATH ?? "",
  scriptPath: process.env.SCRAPER_SCRIPT_PATH ?? "",
  outputBaseDir:
    process.env.SCRAPER_OUTPUT_BASE_DIR ?? path.join(REPO_ROOT, "scraper-output"),
  // Scraper is disabled unless both python path and script path are explicitly configured.
  enabled:
    process.env.SCRAPER_ENABLED !== "false" &&
    !!process.env.SCRAPER_PYTHON_PATH &&
    !!process.env.SCRAPER_SCRIPT_PATH,
  maxLogLength: 200_000,
  maxLocations: 50,
  maxLimit: 200,
  maxConcurrency: 4,
};

export const SCRAPER_CATEGORIES = [
  "Mobile Mechanics",
  "Power washing Business",
  "Landscaping",
  "Tree Removal",
  "Cleaning",
  "Concrete",
  "Fencing Companies",
] as const;

export type ScraperCategory = (typeof SCRAPER_CATEGORIES)[number];
