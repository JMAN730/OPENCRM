"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { trpc } from "@/app/_trpc/client";
import { EmailStatusBadge } from "@/features/emails/components/EmailStatusBadge";
import { EmailDraftStatus } from "@prisma/client";
import { Mail, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";

const STATUS_OPTIONS: Array<{ label: string; value: EmailDraftStatus | "" }> = [
  { label: "All", value: "" },
  { label: "Draft", value: EmailDraftStatus.DRAFT },
  { label: "Sent", value: EmailDraftStatus.SENT },
  { label: "Opened", value: EmailDraftStatus.OPENED },
  { label: "Clicked", value: EmailDraftStatus.CLICKED },
  { label: "Bounced", value: EmailDraftStatus.BOUNCED },
  { label: "Unsubscribed", value: EmailDraftStatus.UNSUBSCRIBED },
];

function OutreachTable() {
  const [statusFilter, setStatusFilter] = useState<EmailDraftStatus | "">("");

  const status = (statusFilter || undefined) as EmailDraftStatus | undefined;
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.emails.listForOrg.useInfiniteQuery(
      { limit: 50, status },
      { getNextPageParam: (page) => page.nextCursor },
    );

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`crm-btn sm${statusFilter === opt.value ? " active" : " ghost"}`}
            onClick={() => setStatusFilter(opt.value as EmailDraftStatus | "")}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--crm-fg-faint)", padding: 24 }}>
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 14 }}>
          <Mail size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
          <p>No email drafts yet.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>
            Open a lead and click &ldquo;Generate outreach email&rdquo; to create one.
          </p>
        </div>
      ) : (
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Events</th>
                <th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const opened = item.events.some((e) => e.event === "opened");
                const clicked = item.events.some((e) => e.event === "clicked");
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {item.lead.company ?? "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>
                        {item.lead.email}
                        {item.lead.city ? ` · ${item.lead.city}` : ""}
                        {item.lead.state ? `, ${item.lead.state}` : ""}
                      </div>
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <span style={{ fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.subject}
                      </span>
                    </td>
                    <td>
                      <EmailStatusBadge status={item.status} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, fontSize: 11, color: "var(--crm-fg-muted)" }}>
                        {opened && <span style={{ color: "#16a34a" }}>Opened</span>}
                        {clicked && <span style={{ color: "#2563eb" }}>Clicked</span>}
                        {!opened && !clicked && <span>—</span>}
                      </div>
                    </td>
                    <td style={{ color: "var(--crm-fg-muted)", fontSize: 12 }}>
                      {item.sentAt
                        ? new Date(item.sentAt).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasNextPage && (
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button
            className="crm-btn ghost sm"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? <Loader2 size={12} className="animate-spin" /> : null}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

export default function OutreachPage() {
  return (
    <DashboardLayout>
      <div className="crm-app" style={{ padding: "24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Outreach</h1>
            <p style={{ fontSize: 13, color: "var(--crm-fg-muted)", marginTop: 4 }}>
              Track cold email drafts, open rates, and click-throughs.
            </p>
          </div>
          <Link href="/leads" className="crm-btn ghost sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ExternalLink size={12} />
            Go to Leads
          </Link>
        </div>
        <OutreachTable />
      </div>
    </DashboardLayout>
  );
}
