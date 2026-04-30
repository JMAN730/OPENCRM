import path from "path";

const REPO_ROOT = process.cwd();

const DEFAULT_PYTHON =
  process.platform === "win32"
    ? "C:/Users/jo/Desktop/Lead_Generation - private/venv/Scripts/python.exe"
    : "/Users/jo/Desktop/Lead_Generation - private/venv/bin/python";

const DEFAULT_SCRIPT =
  process.platform === "win32"
    ? "C:/Users/jo/Desktop/Lead_Generation - private/scraper.py"
    : "/Users/jo/Desktop/Lead_Generation - private/scraper.py";

export const scraperConfig = {
  pythonPath: process.env.SCRAPER_PYTHON_PATH || DEFAULT_PYTHON,
  scriptPath: process.env.SCRAPER_SCRIPT_PATH || DEFAULT_SCRIPT,
  outputBaseDir:
    process.env.SCRAPER_OUTPUT_BASE_DIR ||
    path.join(REPO_ROOT, "scraper-output"),
  enabled: process.env.SCRAPER_ENABLED !== "false",
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
