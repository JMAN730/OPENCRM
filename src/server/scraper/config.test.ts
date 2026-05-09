import { describe, it, expect, afterEach, vi } from "vitest";

// Helper: reload the module after env changes so the config is re-evaluated.
async function loadConfig() {
  vi.resetModules();
  return import("./config");
}

describe("scraperConfig", () => {
  const origPython = process.env.SCRAPER_PYTHON_PATH;
  const origScript = process.env.SCRAPER_SCRIPT_PATH;
  const origEnabled = process.env.SCRAPER_ENABLED;

  afterEach(() => {
    // Restore env after each test
    if (origPython === undefined) delete process.env.SCRAPER_PYTHON_PATH;
    else process.env.SCRAPER_PYTHON_PATH = origPython;
    if (origScript === undefined) delete process.env.SCRAPER_SCRIPT_PATH;
    else process.env.SCRAPER_SCRIPT_PATH = origScript;
    if (origEnabled === undefined) delete process.env.SCRAPER_ENABLED;
    else process.env.SCRAPER_ENABLED = origEnabled;
  });

  it("is disabled when SCRAPER_PYTHON_PATH is not set", async () => {
    delete process.env.SCRAPER_PYTHON_PATH;
    delete process.env.SCRAPER_SCRIPT_PATH;
    const { scraperConfig } = await loadConfig();
    expect(scraperConfig.enabled).toBe(false);
  });

  it("is disabled when only SCRAPER_PYTHON_PATH is set (script path missing)", async () => {
    process.env.SCRAPER_PYTHON_PATH = "/usr/bin/python3";
    delete process.env.SCRAPER_SCRIPT_PATH;
    const { scraperConfig } = await loadConfig();
    expect(scraperConfig.enabled).toBe(false);
  });

  it("is disabled when only SCRAPER_SCRIPT_PATH is set (python path missing)", async () => {
    delete process.env.SCRAPER_PYTHON_PATH;
    process.env.SCRAPER_SCRIPT_PATH = "/app/scraper.py";
    const { scraperConfig } = await loadConfig();
    expect(scraperConfig.enabled).toBe(false);
  });

  it("is enabled when both SCRAPER_PYTHON_PATH and SCRAPER_SCRIPT_PATH are set", async () => {
    process.env.SCRAPER_PYTHON_PATH = "/usr/bin/python3";
    process.env.SCRAPER_SCRIPT_PATH = "/app/scraper.py";
    const { scraperConfig } = await loadConfig();
    expect(scraperConfig.enabled).toBe(true);
  });

  it("is disabled when SCRAPER_ENABLED=false even if paths are set", async () => {
    process.env.SCRAPER_PYTHON_PATH = "/usr/bin/python3";
    process.env.SCRAPER_SCRIPT_PATH = "/app/scraper.py";
    process.env.SCRAPER_ENABLED = "false";
    const { scraperConfig } = await loadConfig();
    expect(scraperConfig.enabled).toBe(false);
  });

  it("has no hardcoded personal paths as defaults", async () => {
    delete process.env.SCRAPER_PYTHON_PATH;
    delete process.env.SCRAPER_SCRIPT_PATH;
    const { scraperConfig } = await loadConfig();
    expect(scraperConfig.pythonPath).toBe("");
    expect(scraperConfig.scriptPath).toBe("");
  });
});
