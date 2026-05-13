"use client";

import { useState } from "react";
import { trpc } from "@/app/_trpc/client";
import { StartJobForm } from "./StartJobForm";
import { JobsTable } from "./JobsTable";
import { JobDetailDialog } from "./JobDetailDialog";

export function ScraperPanel() {
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const config = trpc.scraper.config.useQuery();
  const jobs = trpc.scraper.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data;
      return (data as Array<{ status: string }> | undefined)?.some(
        (j) => j.status === "RUNNING" || j.status === "PENDING",
      )
        ? 2000
        : 10_000;
    },
  });

  const refresh = () => {
    utils.scraper.list.invalidate();
    utils.leads.getAll.invalidate();
  };

  if (config.isLoading) {
    return <div className="text-muted-foreground">Loading scraper...</div>;
  }

  if (config.data && !config.data.enabled) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
        Scraper feature is disabled. Set <code>SCRAPER_ENABLED=true</code> in your <code>.env</code> to enable it.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StartJobForm
        config={config.data!}
        onStarted={refresh}
      />
      <JobsTable
        jobs={jobs.data ?? []}
        isLoading={jobs.isLoading}
        onOpenJob={setOpenJobId}
        onChanged={refresh}
      />
      {openJobId && (
        <JobDetailDialog
          jobId={openJobId}
          onClose={() => setOpenJobId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
