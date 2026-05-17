import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { prisma } from "@/lib/prisma";
import { scraperConfig } from "./config";
import { readScrapedCsv, importRowsToLeads } from "./importer";
import { parseStringArray } from "./utils";

type RunningJob = {
  child: ChildProcessWithoutNullStreams;
  heartbeat: NodeJS.Timeout;
};

type ProgressEvent = {
  event: "progress";
  totalQueries?: number;
  completedQueries?: number;
  failedQueries?: number;
  scrapedCount?: number;
  query?: string;
  status?: string;
  error?: string;
};

const running = new Map<string, RunningJob>();
const logBuffers = new Map<string, { buf: string; flushedAt: number; outputDir?: string | null }>();

const FLUSH_INTERVAL_MS = 1500;
const HEARTBEAT_INTERVAL_MS = 10_000;
const STALE_HEARTBEAT_MS = 2 * 60_000;
const WORKER_ID = `${os.hostname()}:${process.pid}:${randomUUID()}`;

// Survives Next.js hot-reloads so we don't run reconcile on every HMR cycle.
const g = globalThis as unknown as { __scraperInitialized?: boolean };

function jobOutputDir(jobId: string): string {
  return path.join(scraperConfig.outputBaseDir, jobId);
}

function parseScrapedCount(line: string): number {
  const match = line.match(/Saved (\d+) new leads/i);
  return match ? Number(match[1]) : 0;
}

function parseProgressEvent(line: string): ProgressEvent | null {
  try {
    const parsed = JSON.parse(line) as Partial<ProgressEvent>;
    return parsed.event === "progress" ? (parsed as ProgressEvent) : null;
  } catch {
    return null;
  }
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
    const outputDir = entry.outputDir ?? (await prisma.scraperJob.findUnique({
      where: { id: jobId },
      select: { outputDir: true },
    }))?.outputDir;
    if (outputDir) {
      entry.outputDir = outputDir;
      await fs.mkdir(outputDir, { recursive: true });
      await fs.appendFile(path.join(outputDir, "scraper.log"), `${chunk}\n`, "utf-8");
    }

    const job = await prisma.scraperJob.findUnique({
      where: { id: jobId },
      select: { logs: true },
    });
    if (!job) return;
    const merged = (job.logs + chunk).slice(-scraperConfig.maxLogLength);
    await prisma.scraperJob.update({
      where: { id: jobId },
      data: { logs: merged, lastHeartbeatAt: new Date() },
    });
  } catch {
    // Logging must remain best-effort; a transient DB or filesystem write
    // should not terminate the scraper process.
  }
}

function appendLog(jobId: string, line: string, outputDir?: string | null) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  const entry = logBuffers.get(jobId) ?? { buf: "", flushedAt: 0, outputDir };
  entry.buf += (entry.buf ? "\n" : "") + stamped;
  entry.outputDir = outputDir ?? entry.outputDir;
  logBuffers.set(jobId, entry);
  void flushLog(jobId);
}

function startHeartbeat(jobId: string) {
  const heartbeat = setInterval(() => {
    void prisma.scraperJob
      .updateMany({
        where: { id: jobId, status: "RUNNING", workerId: WORKER_ID },
        data: { lastHeartbeatAt: new Date() },
      })
      .catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();
  return heartbeat;
}

function updateProgress(jobId: string, progress: ProgressEvent) {
  void prisma.scraperJob
    .updateMany({
      where: { id: jobId, status: "RUNNING", workerId: WORKER_ID },
      data: {
        ...(typeof progress.totalQueries === "number" ? { totalQueries: progress.totalQueries } : {}),
        ...(typeof progress.completedQueries === "number"
          ? { completedQueries: progress.completedQueries }
          : {}),
        ...(typeof progress.failedQueries === "number" ? { failedQueries: progress.failedQueries } : {}),
        ...(typeof progress.scrapedCount === "number" ? { totalScraped: progress.scrapedCount } : {}),
        lastHeartbeatAt: new Date(),
      },
    })
    .catch(() => {});
}

export function isJobRunning(jobId: string): boolean {
  return running.has(jobId);
}

export async function reconcileOrphanedJobs(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_HEARTBEAT_MS);
  await prisma.scraperJob.updateMany({
    where: {
      status: "RUNNING",
      OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: staleBefore } }],
    },
    data: {
      status: "FAILED",
      error: "Scraper worker stopped reporting heartbeats.",
      completedAt: new Date(),
      workerId: null,
      workerPid: null,
    },
  });
}

export async function initializeScraperWorker(): Promise<void> {
  if (g.__scraperInitialized) return;
  g.__scraperInitialized = true;
  await reconcileOrphanedJobs();
}

export async function deleteScraperOutput(jobId: string, outputDir?: string | null): Promise<void> {
  const dir = outputDir ?? jobOutputDir(jobId);
  const resolvedBase = path.resolve(scraperConfig.outputBaseDir);
  const resolvedDir = path.resolve(dir);
  if (resolvedDir !== path.join(resolvedBase, jobId)) return;
  await fs.rm(resolvedDir, { recursive: true, force: true });
}

export async function startScraperJob(jobId: string): Promise<void> {
  await initializeScraperWorker();

  if (!scraperConfig.enabled) {
    throw new Error("Scraper feature is disabled (SCRAPER_ENABLED=false).");
  }
  if (running.has(jobId)) {
    throw new Error("Job is already running in this worker.");
  }

  const job = await prisma.scraperJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Job not found.");
  if (job.status === "RUNNING") throw new Error("Job is already running.");

  const locationList = parseStringArray(job.locations);
  const categoryList = parseStringArray(job.categories);
  const totalQueries = locationList.length * (categoryList.length || 1);
  const outDir = jobOutputDir(jobId);
  await fs.mkdir(outDir, { recursive: true });

  try {
    await fs.access(scraperConfig.pythonPath);
  } catch {
    throw new Error(
      `Python binary not found at: ${scraperConfig.pythonPath}. Set SCRAPER_PYTHON_PATH in your .env to override.`
    );
  }
  try {
    await fs.access(scraperConfig.scriptPath);
  } catch {
    throw new Error(
      `Scraper script not found at: ${scraperConfig.scriptPath}. Set SCRAPER_SCRIPT_PATH in your .env to override.`
    );
  }

  const locFile = path.join(outDir, "locations.txt");
  await fs.writeFile(locFile, locationList.join("\n"), "utf-8");

  await prisma.scraperJob.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
      outputDir: outDir,
      startedAt: new Date(),
      completedAt: null,
      logs: "",
      error: null,
      totalScraped: 0,
      totalQueries,
      completedQueries: 0,
      failedQueries: 0,
      workerId: WORKER_ID,
      workerPid: process.pid,
      lastHeartbeatAt: new Date(),
      stopRequestedAt: null,
    },
  });

  appendLog(
    jobId,
    `Starting scraper for ${locationList.length} location(s) and ${categoryList.length || "all"} category(ies)...`,
    outDir
  );

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

  appendLog(jobId, `cmd: "${scraperConfig.pythonPath}" ${args.map((a) => `"${a}"`).join(" ")}`, outDir);

  const child = spawn(scraperConfig.pythonPath, args, {
    cwd: path.dirname(scraperConfig.scriptPath),
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    },
    windowsHide: true,
  });

  running.set(jobId, { child, heartbeat: startHeartbeat(jobId) });

  let scrapedTotal = 0;

  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (data: string) => {
    for (const line of data.split(/\r?\n/)) {
      if (!line.trim()) continue;
      appendLog(jobId, line, outDir);
      const progress = parseProgressEvent(line);
      if (progress) {
        updateProgress(jobId, progress);
        if (typeof progress.scrapedCount === "number") scrapedTotal = progress.scrapedCount;
        continue;
      }
      const n = parseScrapedCount(line);
      if (n > 0) {
        scrapedTotal += n;
        void prisma.scraperJob
          .updateMany({
            where: { id: jobId, status: "RUNNING", workerId: WORKER_ID },
            data: { totalScraped: scrapedTotal, lastHeartbeatAt: new Date() },
          })
          .catch(() => {});
      }
    }
  });

  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (data: string) => {
    for (const line of data.split(/\r?\n/)) {
      if (!line.trim()) continue;
      appendLog(jobId, `[stderr] ${line}`, outDir);
    }
  });

  child.on("error", async (err) => {
    appendLog(jobId, `[spawn-error] ${err.message}`, outDir);
    await flushLog(jobId, true);
    const current = running.get(jobId);
    if (current) clearInterval(current.heartbeat);
    running.delete(jobId);
    await prisma.scraperJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: err.message,
          completedAt: new Date(),
          workerId: null,
          workerPid: null,
        },
      })
      .catch(() => {});
  });

  child.on("close", async (code, signal) => {
    const current = running.get(jobId);
    if (current) clearInterval(current.heartbeat);
    running.delete(jobId);
    appendLog(jobId, `Process exited (code=${code ?? "?"}, signal=${signal ?? "-"}).`, outDir);

    const freshJob = await prisma.scraperJob
      .findUnique({
        where: { id: jobId },
        select: { autoImport: true, organizationId: true, userId: true, stopRequestedAt: true },
      })
      .catch(() => null);

    const stoppedByUser =
      signal === "SIGTERM" || signal === "SIGKILL" || freshJob?.stopRequestedAt != null;

    let importError: string | null = null;

    if (freshJob?.autoImport && !stoppedByUser) {
      try {
        const rows = await readScrapedCsv(outDir);
        appendLog(jobId, `Read ${rows.length} rows from leads.csv. Importing to CRM...`, outDir);
        const importResult = await importRowsToLeads({
          rows,
          organizationId: freshJob.organizationId,
          assignedToId: freshJob.userId,
          jobId,
        });
        appendLog(
          jobId,
          `Imported ${importResult.inserted} new leads (skipped ${importResult.skipped} duplicates/empty).`,
          outDir
        );
      } catch (e) {
        importError = e instanceof Error ? e.message : String(e);
        appendLog(jobId, `[import-error] ${importError}`, outDir);
      }
    }

    await flushLog(jobId, true);

    let finalStatus: "COMPLETED" | "FAILED" | "STOPPED";
    if (stoppedByUser) finalStatus = "STOPPED";
    else if (code === 0 && !importError) finalStatus = "COMPLETED";
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
          workerId: null,
          workerPid: null,
          lastHeartbeatAt: new Date(),
        },
      })
      .catch(() => {});
  });
}

export async function stopScraperJob(jobId: string): Promise<void> {
  await prisma.scraperJob
    .updateMany({
      where: { id: jobId, status: "RUNNING" },
      data: { stopRequestedAt: new Date(), lastHeartbeatAt: new Date() },
    })
    .catch(() => {});

  const current = running.get(jobId);
  if (!current) {
    await prisma.scraperJob
      .updateMany({
        where: { id: jobId, status: "RUNNING" },
        data: {
          status: "STOPPED",
          completedAt: new Date(),
          error: "Stopped (no active local process found).",
          workerId: null,
          workerPid: null,
        },
      })
      .catch(() => {});
    return;
  }
  appendLog(jobId, "Stop requested by user.");
  await flushLog(jobId, true);
  try {
    current.child.kill("SIGTERM");
  } catch {
    // Ignore race with natural process exit.
  }
}
