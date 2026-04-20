"use client";

import { trpc } from "@/app/_trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Square, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Job = {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "STOPPED";
  locations: string[];
  totalScraped: number;
  importedCount: number;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  createdAt: Date | string;
  error: string | null;
};

interface Props {
  jobs: Job[];
  isLoading: boolean;
  onOpenJob: (id: string) => void;
  onChanged: () => void;
}

function statusColor(status: Job["status"]) {
  switch (status) {
    case "RUNNING":
      return "bg-blue-500/10 text-blue-500";
    case "PENDING":
      return "bg-amber-500/10 text-amber-600";
    case "COMPLETED":
      return "bg-green-500/10 text-green-600";
    case "FAILED":
      return "bg-destructive/10 text-destructive";
    case "STOPPED":
      return "bg-muted text-muted-foreground";
  }
}

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

export function JobsTable({ jobs, isLoading, onOpenJob, onChanged }: Props) {
  const stop = trpc.scraper.stop.useMutation({
    onSuccess: () => {
      toast.success("Stop signal sent.");
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.scraper.delete.useMutation({
    onSuccess: () => {
      toast.success("Job deleted.");
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="text-muted-foreground p-4">Loading jobs...</div>;
  }

  return (
    <div className="rounded-md border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Locations</TableHead>
            <TableHead className="text-right">Scraped</TableHead>
            <TableHead className="text-right">Imported</TableHead>
            <TableHead>Started</TableHead>
            <TableHead className="w-[160px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                No scraper jobs yet. Start one above.
              </TableCell>
            </TableRow>
          ) : (
            jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <Badge variant="outline" className={statusColor(job.status)}>
                    {job.status === "RUNNING" && (
                      <Loader2 size={12} className="mr-1 animate-spin inline" />
                    )}
                    {job.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <span className="line-clamp-1" title={job.locations.join(", ")}>
                    {job.locations.join(", ")}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{job.totalScraped}</TableCell>
                <TableCell className="text-right tabular-nums">{job.importedCount}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {fmtDate(job.startedAt ?? job.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenJob(job.id)}
                      className="gap-1"
                    >
                      <Eye size={14} /> View
                    </Button>
                    {job.status === "RUNNING" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => stop.mutate({ id: job.id })}
                        className="gap-1 text-destructive"
                        disabled={stop.isPending}
                      >
                        <Square size={14} /> Stop
                      </Button>
                    )}
                    {job.status !== "RUNNING" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Delete this job and its logs?")) {
                            del.mutate({ id: job.id });
                          }
                        }}
                        className="text-muted-foreground hover:text-destructive"
                        disabled={del.isPending}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
