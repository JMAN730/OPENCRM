import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { scraperConfig } from "./config";
import { readScrapedCsv, importRowsToLeads } from "./importer";

// In-memory registry of currently running jobs in this Node process.
// Survives across hot reloads in dev via globalThis.
const globalForScraper = globalThis as unknown as {
  __scraperRunning?: Map<string, ChildProcessWithoutNullStreams>;
  __scraperLogBuffers?: Map<string, { buf: string; flushedAt: number }>;
};

const running =
  globalForScraper.__scraperRunning ?? (globalForScraper.__scraperRunning = new Map());
const logBuffers =
  globalForScraper.__scraperLogBuffers ??
  (globalForScraper.__scraperLogBuffers = new Map());

const FLUSH_INTERVAL_MS = 1500;

function jobOutputDir(jobId: string): string {
  return path.join(scraperConfig.outputBaseDir, jobId);
}

async function flushLog(jobId: string, force = false) {
  const entry = logBuffers.get(jobId);
  if (!entry) return;
  const now = Date.now();
  if (!force && now - entry.flushedAt < FLUSH_INTERVAL_MS) return;
  if (!entry.buf) return;

  const chunk = entry.buf;
  entry.buf = "";
  entry.flushedAt = now;

  try {
    const job = await prisma.scraperJob.findUnique({
      where: { id: jobId },
      select: { logs: true },
    });
    if (!job) return;
    const merged = (job.logs + chunk).slice(-scraperConfig.maxLogLength);
    await prisma.scraperJob.update({
      where: { id: jobId },
      data: { logs: merged },
    });
  } catch {
    // best-effort logging — don't crash the scraper if a single log write fails
  }
}

function appendLog(jobId: string, line: string) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  const entry =
    logBuffers.get(jobId) ?? { buf: "", flushedAt: 0 };
  entry.buf += (entry.buf ? "\n" : "") + stamped;
  logBuffers.set(jobId, entry);
  void flushLog(jobId);
}

function parseScrapedCount(line: string): number {
  // Scraper logs lines like: "Saved 12 new leads for ..." — accumulate.
  const match = line.match(/Saved (\d+) new leads/i);
  return match ? Number(match[1]) : 0;
}

export function isJobRunning(jobId: string): boolean {
  return running.has(jobId);
}

export async function reconcileOrphanedJobs(): Promise<void> {
  // Mark any RUNNING jobs that aren't in our in-memory registry as FAILED.
  // Called on first list/start to clean up after server restarts.
  const stale = await prisma.scraperJob.findMany({
    where: { status: "RUNNING" },
    select: { id: true },
  });
  const orphans = stale.filter((s) => !running.has(s.id));
  if (orphans.length === 0) return;
  await prisma.scraperJob.updateMany({
    where: { id: { in: orphans.map((o) => o.id) } },
    data: {
      status: "FAILED",
      error: "Server restarted while job was running.",
      completedAt: new Date(),
    },
  });
}

export async function startScraperJob(jobId: string): Promise<void> {
  if (!scraperConfig.enabled) {
    throw new Error("Scraper feature is disabled (SCRAPER_ENABLED=false).");
  }
  if (running.has(jobId)) {
    throw new Error("Job is already running.");
  }

  const job = await prisma.scraperJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job not found.");
  if (job.status === "RUNNING") throw new Error("Job is already running.");

  // Prepare per-job output directory
  const outDir = jobOutputDir(jobId);
  await fs.mkdir(outDir, { recursive: true });

  // Verify Python + script exist before spawning — clearer error than ENOENT
  try {
    await fs.access(scraperConfig.pythonPath);
  } catch {
    throw new Error(
      `Python binary not found at: ${scraperConfig.pythonPath}. ` +
        `Set SCRAPER_PYTHON_PATH in your .env to override.`
    );
  }
  try {
    await fs.access(scraperConfig.scriptPath);
  } catch {
    throw new Error(
      `Scraper script not found at: ${scraperConfig.scriptPath}. ` +
        `Set SCRAPER_SCRIPT_PATH in your .env to override.`
    );
  }

  // locations and categories are stored as JSON strings in the DB — parse them back to arrays
  let locationList: string[];
  try { locationList = JSON.parse(job.locations as string); } catch { locationList = []; }

  let categoryList: string[];
  try { categoryList = JSON.parse(job.categories as string); } catch { categoryList = []; }

  // Build a locations file (more robust than passing a long arg list)
  const locFile = path.join(outDir, "locations.txt");
  await fs.writeFile(locFile, locationList.join("\n"), "utf-8");

  await prisma.scraperJob.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
      outputDir: outDir,
      startedAt: new Date(),
      logs: "",
      error: null,
    },
  });

  appendLog(jobId, `Starting scraper for ${locationList.length} location(s) and ${categoryList.length} category(ies)...`);
  
  const args = [
    scraperConfig.scriptPath,
    "--file",
    locFile,
    "--output-dir",
    outDir,
    "--limit",
    String(job.limit),
    "--concurrency",
    String(job.concurrency),
  ];

  if (categoryList.length > 0) {
    args.push("--categories", categoryList.join(","));
  }

  appendLog(
    jobId,
    `cmd: "${scraperConfig.pythonPath}" ${args.map(a => `"${a}"`).join(" ")}`
  );

  const child = spawn(
    scraperConfig.pythonPath,
    args,
    {
      cwd: path.dirname(scraperConfig.scriptPath),
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
      },
      windowsHide: true,
    }
  );

  running.set(jobId, child);

  let scrapedTotal = 0;

  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (data: string) => {
    for (const line of data.split(/\r?\n/)) {
      if (!line.trim()) continue;
      appendLog(jobId, line);
      const n = parseScrapedCount(line);
      if (n > 0) {
        scrapedTotal += n;
        void prisma.scraperJob
          .update({
            where: { id: jobId },
            data: { totalScraped: scrapedTotal },
          })
          .catch(() => {});
      }
    }
  });

  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (data: string) => {
    for (const line of data.split(/\r?\n/)) {
      if (!line.trim()) continue;
      appendLog(jobId, `[stderr] ${line}`);
    }
  });

  child.on("error", async (err) => {
    appendLog(jobId, `[spawn-error] ${err.message}`);
    await flushLog(jobId, true);
    await prisma.scraperJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: err.message,
          completedAt: new Date(),
        },
      })
      .catch(() => {});
    running.delete(jobId);
  });

  child.on("close", async (code, signal) => {
    running.delete(jobId);
    appendLog(jobId, `Process exited (code=${code ?? "?"}, signal=${signal ?? "—"}).`);

    const stoppedByUser = signal === "SIGTERM" || signal === "SIGKILL";

    let importResult = { inserted: 0, skipped: 0 };
    let importError: string | null = null;

    if (job.autoImport) {
      try {
        const rows = await readScrapedCsv(outDir);
        appendLog(jobId, `Read ${rows.length} rows from leads.csv. Importing to CRM...`);
        importResult = await importRowsToLeads({
          rows,
          organizationId: job.organizationId,
          assignedToId: job.userId,
          jobId,
        });
        appendLog(
          jobId,
          `Imported ${importResult.inserted} new leads (skipped ${importResult.skipped} duplicates/empty).`
        );
      } catch (e) {
        importError = e instanceof Error ? e.message : String(e);
        appendLog(jobId, `[import-error] ${importError}`);
      }
    }

    await flushLog(jobId, true);

    let finalStatus: "COMPLETED" | "FAILED" | "STOPPED";
    if (stoppedByUser) finalStatus = "STOPPED";
    else if (code === 0) finalStatus = "COMPLETED";
    else finalStatus = "FAILED";

    await prisma.scraperJob
      .update({
        where: { id: jobId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          error:
            finalStatus === "FAILED"
              ? importError ?? `Process exited with code ${code}`
              : null,
        },
      })
      .catch(() => {});
  });
}

export async function stopScraperJob(jobId: string): Promise<void> {
  const child = running.get(jobId);
  if (!child) {
    // Not in-memory — maybe orphaned. Mark stopped if still RUNNING.
    await prisma.scraperJob
      .updateMany({
        where: { id: jobId, status: "RUNNING" },
        data: {
          status: "STOPPED",
          completedAt: new Date(),
          error: "Stopped (no active process found).",
        },
      })
      .catch(() => {});
    return;
  }
  appendLog(jobId, "Stop requested by user.");
  await flushLog(jobId, true);
  // On Windows, SIGTERM still works for our spawned process tree
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}
