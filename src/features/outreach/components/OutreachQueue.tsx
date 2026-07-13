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
import { SmsStatusBadge } from "@/features/sms/components/SmsStatusBadge";
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
  no_contact: "No phone or email",
  opted_out: "Opted out",
  phone_opted_out: "Phone opted out",
  sms_not_configured: "SMS not configured",
  draft_exists: "Draft already existed",
  lead_deleted: "Lead deleted",
};

type DraftSummary =
  | {
      id: string;
      channel: "EMAIL";
      subject: string;
      body: string;
      status: "DRAFT" | "SENT" | "OPENED" | "CLICKED" | "BOUNCED" | "COMPLAINED" | "UNSUBSCRIBED";
      sentAt: Date | string | null;
    }
  | {
      id: string;
      channel: "SMS";
      body: string;
      status: "DRAFT" | "SENT" | "DELIVERED" | "FAILED";
      sentAt: Date | string | null;
    };

export function OutreachDraftSummary({
  draft,
  onReview,
}: {
  draft: DraftSummary;
  onReview: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Badge variant={draft.channel === "SMS" ? "default" : "outline"}>{draft.channel}</Badge>
        {draft.channel === "SMS" ? (
          <SmsStatusBadge status={draft.status} />
        ) : (
          <EmailStatusBadge status={draft.status} />
        )}
      </div>
      <button
        type="button"
        className="block max-w-72 truncate text-left text-sm underline-offset-2 hover:underline"
        title="Review draft"
        onClick={onReview}
      >
        {draft.channel === "SMS" ? draft.body : draft.subject}
      </button>
    </div>
  );
}

export function OutreachQueue() {
  const [filter, setFilter] = useState<JobStatus | "ALL">("DONE");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);
  const [previewChannel, setPreviewChannel] = useState<"EMAIL" | "SMS" | null>(null);

  const utils = trpc.useUtils();
  const stats = trpc.outreach.stats.useQuery();
  const list = trpc.outreach.list.useInfiniteQuery(
    { status: filter === "ALL" ? undefined : filter, limit: 50 },
    { getNextPageParam: (last) => last.nextCursor },
  );

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const sendableIds = useMemo(
    () =>
      items
        .filter((item) => item.draft?.status === "DRAFT")
        .map((item) => `${item.draft!.channel}:${item.draft!.id}`),
    [items],
  );
  const draftsByKey = useMemo<Map<string, { id: string; channel: "EMAIL" | "SMS" }>>(
    () =>
      new Map(
        items
          .filter((item) => item.draft)
          .map((item) => [
            `${item.draft!.channel}:${item.draft!.id}`,
            { id: item.draft!.id, channel: item.draft!.channel },
          ] as const),
      ),
    [items],
  );

  const invalidate = () => {
    void utils.outreach.list.invalidate();
    void utils.outreach.stats.invalidate();
  };

  const bulkSend = trpc.outreach.bulkSend.useMutation({
    onSuccess: (res) => {
      if (res.sent.length > 0) toast.success(`Sent ${res.sent.length} outreach message${res.sent.length === 1 ? "" : "s"}.`);
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

  const toggle = (draftKey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(draftKey)) next.delete(draftKey);
      else next.add(draftKey);
      return next;
    });
  };

  const sendSelected = async (draftKeys: string[]) => {
    // The mutation accepts at most 20 drafts per call (matches the send rate limit).
    const drafts = draftKeys
      .map((key) => draftsByKey.get(key))
      .filter((draft): draft is { id: string; channel: "EMAIL" | "SMS" } => Boolean(draft));
    for (let i = 0; i < drafts.length; i += 20) {
      await bulkSend.mutateAsync({ drafts: drafts.slice(i, i + 20) }).catch(() => {});
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
                Demo sites with SMS-first outreach and email fallback. Review every draft, then send.
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
                    <TableHead>Contact</TableHead>
                    <TableHead>Draft</TableHead>
                    <TableHead>Demo site</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const sendable = item.draft?.status === "DRAFT";
                    const draftKey = item.draft
                      ? `${item.draft.channel}:${item.draft.id}`
                      : null;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          {sendable ? (
                            <Checkbox
                              checked={selected.has(draftKey!)}
                              onCheckedChange={() => toggle(draftKey!)}
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
                        <TableCell className="text-muted-foreground">
                          {item.draft?.channel === "SMS"
                            ? item.lead.phone ?? "—"
                            : item.lead.email ?? item.lead.phone ?? "—"}
                        </TableCell>
                        <TableCell>
                          {item.draft ? (
                            <OutreachDraftSummary
                              draft={item.draft}
                              onReview={() => {
                                setPreviewLeadId(item.lead.id);
                                setPreviewChannel(item.draft!.channel);
                              }}
                            />
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
                            item.draft.channel === "SMS" ? (
                              <SmsStatusBadge status={item.draft.status} />
                            ) : (
                              <EmailStatusBadge status={item.draft.status} />
                            )
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
                              onClick={() => void sendSelected([draftKey!])}
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
        leadId={previewChannel === "EMAIL" ? previewLeadId : null}
        onClose={() => {
          setPreviewLeadId(null);
          setPreviewChannel(null);
        }}
        onChanged={invalidate}
      />
      <SmsDraftPreviewDialog
        leadId={previewChannel === "SMS" ? previewLeadId : null}
        onClose={() => {
          setPreviewLeadId(null);
          setPreviewChannel(null);
        }}
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

function SmsDraftPreviewDialog({
  leadId,
  onClose,
  onChanged,
}: {
  leadId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const draft = trpc.sms.getForLead.useQuery(
    { leadId: leadId ?? "" },
    { enabled: Boolean(leadId) },
  );
  const [body, setBody] = useState<string | null>(null);
  const update = trpc.sms.updateBody.useMutation({
    onSuccess: () => {
      toast.success("SMS draft updated.");
      setBody(null);
      void draft.refetch();
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });
  const data = draft.data;
  const editable = data?.status === "DRAFT";
  const currentBody = body ?? data?.body ?? "";
  const dirty = Boolean(data && currentBody !== data.body);

  return (
    <Dialog
      open={Boolean(leadId)}
      onOpenChange={(open) => {
        if (!open) {
          setBody(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Outreach SMS</DialogTitle>
          <DialogDescription>
            {editable ? "Review and edit before sending." : "This SMS has already been sent."}
          </DialogDescription>
        </DialogHeader>
        {draft.isLoading || !data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="outreach-sms-body">Message</Label>
              <textarea
                id="outreach-sms-body"
                value={currentBody}
                disabled={!editable}
                rows={8}
                maxLength={1600}
                onChange={(event) => setBody(event.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            {editable ? (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!dirty || update.isPending}
                  onClick={() => update.mutate({ id: data.id, body: currentBody })}
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
