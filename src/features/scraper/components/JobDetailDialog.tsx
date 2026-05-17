"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/app/_trpc/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Download, Upload, RefreshCw } from "lucide-react";

interface Props {
  jobId: string;
  onClose: () => void;
  onChanged: () => void;
}

export function JobDetailDialog({ jobId, onClose, onChanged }: Props) {
  const job = trpc.scraper.getById.useQuery(
    { id: jobId },
    {
      refetchInterval: (q) =>
        q.state.data?.status === "RUNNING" ? 1500 : false,
    }
  );
  const preview = trpc.scraper.previewResults.useQuery(
    { id: jobId },
    { enabled: !!job.data && job.data.status !== "RUNNING" && job.data.status !== "PENDING" }
  );

  const [excludeMissingPhone, setExcludeMissingPhone] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  // Auto-scroll log view
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job.data?.logs]);

  const importNow = trpc.scraper.importResults.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Imported ${res.inserted} leads (${res.skipped} skipped, ${res.considered} considered).`
      );
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  const exportCsv = () => {
    const rows = preview.data?.rows ?? [];
    if (rows.length === 0) {
      toast.error("Nothing to export.");
      return;
    }
    const headers = Array.from(
      new Set(rows.flatMap((r) => Object.keys(r as object)))
    );
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv =
      headers.join(",") +
      "\n" +
      rows
        .map((r) =>
          headers.map((h) => escape((r as Record<string, unknown>)[h])).join(",")
        )
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scraper-${jobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background">
        <DialogHeader>
          <DialogTitle>Scraper job</DialogTitle>
          <DialogDescription>
            {job.data ? (
              <>
                {job.data.locations.length} location(s), limit {job.data.limit}, concurrency{" "}
                {job.data.concurrency}
              </>
            ) : (
              "Loading..."
            )}
          </DialogDescription>
        </DialogHeader>

        {job.data && (
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="outline">{job.data.status}</Badge>
              <span className="min-w-0 text-muted-foreground">
                Scraped <strong className="text-foreground">{job.data.totalScraped}</strong> ·
                Imported <strong className="text-foreground">{job.data.importedCount}</strong>
                {job.data.totalQueries > 0 && (
                  <>
                    {" "}· Queries{" "}
                    <strong className="text-foreground">
                      {job.data.completedQueries}/{job.data.totalQueries}
                    </strong>
                    {job.data.failedQueries > 0 && (
                      <> · Failed <strong className="text-foreground">{job.data.failedQueries}</strong></>
                    )}
                  </>
                )}
              </span>
              {job.data.completedAt && (
                <span className="text-xs text-muted-foreground sm:ml-auto">
                  Completed {new Date(job.data.completedAt).toLocaleString()}
                </span>
              )}
            </div>

            {job.data.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <strong>Error:</strong> {job.data.error}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium uppercase text-muted-foreground">
                  Logs
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs"
                  onClick={() => job.refetch()}
                >
                  <RefreshCw size={12} /> Refresh
                </Button>
              </div>
              <pre
                ref={logRef}
                className="max-h-64 overflow-auto rounded-md bg-muted/40 border border-border p-3 text-[11px] font-mono whitespace-pre-wrap break-words"
              >
                {job.data.logs || "(no logs yet)"}
              </pre>
            </div>

            {job.data.status !== "RUNNING" && job.data.status !== "PENDING" && (
              <div className="rounded-md border border-border p-3 space-y-3">
                <div className="text-sm font-medium">Results</div>
                <div className="text-xs text-muted-foreground">
                  {preview.data?.rows.length ?? 0} rows in output CSV
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={excludeMissingPhone}
                    onCheckedChange={(v) => setExcludeMissingPhone(v === true)}
                  />
                  <span>Filter out rows with no phone number on import</span>
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      importNow.mutate({
                        id: jobId,
                        filter: { excludeMissingPhone },
                      })
                    }
                    disabled={importNow.isPending}
                    className="gap-2"
                  >
                    <Upload size={14} />
                    {importNow.isPending ? "Importing..." : "Import to Leads"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportCsv} className="gap-2">
                    <Download size={14} />
                    Export CSV
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
