"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/app/_trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmailStatusBadge } from "@/features/emails/components/EmailStatusBadge";
import { toast } from "sonner";
import { ExternalLink, Loader2, RefreshCw, Send } from "lucide-react";

type JobStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "SKIPPED";

const FILTERS: Array<{ id: JobStatus | "ALL"; label: string }> = [
  { id: "DONE", label: "Ready" },
  { id: "PENDING", label: "Queued" },
  { id: "SKIPPED", label: "Skipped" },
  { id: "FAILED", label: "Failed" },
  { id: "ALL", label: "All" },
];

const SKIP_LABELS: Record<string, string> = {
  no_email: "No email address",
  opted_out: "Opted out",
  draft_exists: "Draft already existed",
  lead_deleted: "Lead deleted",
};

export function OutreachQueue() {
  const [filter, setFilter] = useState<JobStatus | "ALL">("DONE");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const stats = trpc.outreach.stats.useQuery();
  const list = trpc.outreach.list.useInfiniteQuery(
    { status: filter === "ALL" ? undefined : filter, limit: 50 },
    { getNextPageParam: (last) => last.nextCursor },
  );

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const sendableIds = useMemo(
    () => items.filter((i) => i.draft?.status === "DRAFT").map((i) => i.draft!.id),
    [items],
  );

  const invalidate = () => {
    void utils.outreach.list.invalidate();
    void utils.outreach.stats.invalidate();
  };

  const bulkSend = trpc.outreach.bulkSend.useMutation({
    onSuccess: (res) => {
      if (res.sent.length > 0) toast.success(`Sent ${res.sent.length} email${res.sent.length === 1 ? "" : "s"}.`);
      for (const f of res.failed) toast.error(`Send failed: ${f.error}`);
      setSelected(new Set());
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const retry = trpc.outreach.retry.useMutation({
    onSuccess: () => {
      toast.success("Queued for another attempt.");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggle = (draftId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(draftId)) next.delete(draftId);
      else next.add(draftId);
      return next;
    });
  };

  const sendSelected = async (draftIds: string[]) => {
    // The mutation accepts at most 20 drafts per call (matches the send rate limit).
    for (let i = 0; i < draftIds.length; i += 20) {
      await bulkSend.mutateAsync({ draftIds: draftIds.slice(i, i + 20) }).catch(() => {});
    }
  };

  const counts = stats.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Queued" value={(counts?.PENDING ?? 0) + (counts?.PROCESSING ?? 0)} loading={stats.isLoading} />
        <StatCard label="Ready" value={counts?.DONE ?? 0} loading={stats.isLoading} />
        <StatCard label="Skipped" value={counts?.SKIPPED ?? 0} loading={stats.isLoading} />
        <StatCard label="Failed" value={counts?.FAILED ?? 0} loading={stats.isLoading} />
        <StatCard
          label="Selected"
          value={selected.size}
          loading={false}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Outreach queue</CardTitle>
              <CardDescription>
                Demo sites and email drafts generated from scraped leads. Review, then send.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={sendableIds.length === 0}
                onClick={() => setSelected(new Set(sendableIds))}
              >
                Select all sendable
              </Button>
              <Button
                size="sm"
                className="gap-2"
                disabled={selected.size === 0 || bulkSend.isPending}
                onClick={() => void sendSelected(Array.from(selected))}
              >
                {bulkSend.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Send {selected.size > 0 ? selected.size : ""} selected
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFilter(f.id);
                  setSelected(new Set());
                }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  filter === f.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-transparent hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing here yet. Start a scrape with &ldquo;auto-outreach&rdquo; enabled, and
              generated drafts will land in this queue once the outreach cron has run.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Business</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Draft</TableHead>
                    <TableHead>Demo site</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const sendable = item.draft?.status === "DRAFT";
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          {sendable ? (
                            <Checkbox
                              checked={selected.has(item.draft!.id)}
                              onCheckedChange={() => toggle(item.draft!.id)}
                            />
                          ) : null}
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.lead.company ?? "—"}
                          {item.lead.city ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {item.lead.city}
                              {item.lead.state ? `, ${item.lead.state}` : ""}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.lead.email ?? "—"}</TableCell>
                        <TableCell>
                          {item.draft ? (
                            <button
                              type="button"
                              className="max-w-56 truncate text-left underline-offset-2 hover:underline"
                              title="Review draft"
                              onClick={() => setPreviewLeadId(item.lead.id)}
                            >
                              {item.draft.subject}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.website?.slug ? (
                            <Link
                              href={`/demo/${item.website.slug}`}
                              target="_blank"
                              className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
                            >
                              Preview <ExternalLink size={12} />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.draft ? (
                            <EmailStatusBadge status={item.draft.status} />
                          ) : item.status === "SKIPPED" ? (
                            <Badge variant="outline" title={item.skipReason ?? undefined}>
                              {SKIP_LABELS[item.skipReason ?? ""] ?? "Skipped"}
                            </Badge>
                          ) : item.status === "FAILED" ? (
                            <Badge variant="destructive" title={item.error ?? undefined}>
                              Failed
                            </Badge>
                          ) : (
                            <Badge variant="secondary">{item.status === "PROCESSING" ? "Generating…" : "Queued"}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {sendable ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              disabled={bulkSend.isPending}
                              onClick={() => void sendSelected([item.draft!.id])}
                            >
                              <Send size={12} /> Send
                            </Button>
                          ) : item.status === "FAILED" || item.status === "SKIPPED" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              disabled={retry.isPending}
                              onClick={() => retry.mutate({ id: item.id })}
                            >
                              <RefreshCw size={12} /> Retry
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {list.hasNextPage ? (
                <div className="flex justify-center pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    {list.isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <DraftPreviewDialog
        leadId={previewLeadId}
        onClose={() => setPreviewLeadId(null)}
        onChanged={invalidate}
      />
    </div>
  );
}

function StatCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-10" />
        ) : (
          <div className="text-xl font-semibold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

function DraftPreviewDialog({
  leadId,
  onClose,
  onChanged,
}: {
  leadId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const draft = trpc.emails.getDraftForLead.useQuery(
    { leadId: leadId ?? "" },
    { enabled: !!leadId },
  );
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);

  const update = trpc.emails.updateDraft.useMutation({
    onSuccess: () => {
      toast.success("Draft updated.");
      void draft.refetch();
      onChanged();
    },
    onError: (err) => toast.error(err.message),
  });

  const data = draft.data;
  const editable = data?.status === "DRAFT";
  const currentSubject = subject ?? data?.subject ?? "";
  const currentBody = body ?? data?.body ?? "";
  const dirty = data ? currentSubject !== data.subject || currentBody !== data.body : false;

  return (
    <Dialog
      open={!!leadId}
      onOpenChange={(open) => {
        if (!open) {
          setSubject(null);
          setBody(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Outreach email</DialogTitle>
          <DialogDescription>
            {editable ? "Review and edit before sending." : "This email has already been sent."}
          </DialogDescription>
        </DialogHeader>
        {draft.isLoading || !data ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="outreach-subject">Subject</Label>
              <Input
                id="outreach-subject"
                value={currentSubject}
                disabled={!editable}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="outreach-body">Body</Label>
              <textarea
                id="outreach-body"
                value={currentBody}
                disabled={!editable}
                rows={14}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            {editable ? (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!dirty || update.isPending}
                  onClick={() =>
                    update.mutate({ id: data.id, subject: currentSubject, body: currentBody })
                  }
                >
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
