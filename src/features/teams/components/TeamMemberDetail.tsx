"use client";

import { trpc } from "@/app/_trpc/client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}
function avatarClass(seed: string | null | undefined) {
  const n = (((seed ?? "")?.charCodeAt(0) || 0) % 6) + 1;
  return `c${n}`;
}
function relativeTime(iso: string | Date) {
  const d = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString();
}

const STAGE_TONE: Record<string, string> = {
  NEW: "var(--crm-fg-faint)",
  CONTACTED: "var(--crm-accent, #3b82f6)",
  QUALIFIED: "var(--crm-warn, #d4a017)",
  WON: "var(--crm-pos, #16a34a)",
  LOST: "var(--crm-neg, #dc2626)",
  UNQUALIFIED: "var(--crm-neg, #dc2626)",
};

export function TeamMemberDetail({ userId }: { userId: string }) {
  const { data, isLoading, error } = trpc.teams.memberDetail.useQuery({ userId });

  if (isLoading) {
    return (
      <div className="crm-content">
        <div style={{ padding: 32, textAlign: "center", color: "var(--crm-fg-faint)" }}>Loading…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="crm-content">
        <div className="crm-card" style={{ padding: 24, color: "var(--crm-neg)" }}>
          {error.message}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { user, leads, recentCalls, openTasks, leadCount, callCount } = data;
  const name = user.name || user.email || "Member";

  return (
    <div className="crm-content">
      <div className="crm-page-head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/team" className="crm-btn ghost icon" style={{ textDecoration: "none" }}>
            <ArrowLeft size={14} />
          </Link>
          <div className={`crm-avatar ${avatarClass(name)}`} style={{ width: 48, height: 48, fontSize: 16 }}>
            {initials(name)}
          </div>
          <div>
            <h1 className="crm-page-title">{name}</h1>
            <div className="crm-page-sub">
              {user.role} {user.team ? `· ${user.team.name}` : ""}
              {user.email ? ` · ${user.email}` : ""}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Leads owned" value={leadCount} />
        <StatCard label="Calls logged" value={callCount} />
        <StatCard label="Open tasks" value={openTasks.length} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="crm-card flush">
          <div className="crm-card-head">
            <h3>Leads</h3>
            <span className="crm-sub">· {leads.length}{leadCount > leads.length ? ` of ${leadCount}` : ""}</span>
          </div>
          {leads.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--crm-fg-faint)" }}>
              No leads assigned to this user.
            </div>
          ) : (
            <table className="crm-table-v1">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Company</th>
                  <th>Stage</th>
                  <th>Last touch</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l: any) => {
                  const ln = [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "Lead";
                  return (
                    <tr key={l.id}>
                      <td>
                        <div className="crm-contact">
                          <div className={`crm-avatar sm ${avatarClass(ln)}`}>{initials(ln)}</div>
                          <div className="crm-meta">
                            <span className="crm-n">{ln}</span>
                            {l.email && <span className="crm-c">{l.email}</span>}
                          </div>
                        </div>
                      </td>
                      <td>{l.company || "—"}</td>
                      <td><span style={{ color: STAGE_TONE[l.status] ?? "var(--crm-fg)", fontSize: 12 }}>{l.status}</span></td>
                      <td className="mono">{relativeTime(l.updatedAt || l.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="crm-card flush">
            <div className="crm-card-head">
              <h3>Recent calls</h3>
              <span className="crm-sub">· {recentCalls.length}</span>
            </div>
            {recentCalls.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "var(--crm-fg-faint)" }}>No calls yet.</div>
            ) : (
              recentCalls.map((c: any) => {
                const ln = [c.lead?.firstName, c.lead?.lastName].filter(Boolean).join(" ") || c.lead?.company || "Lead";
                return (
                  <div key={c.id} style={{ padding: "10px 14px", borderTop: "1px solid var(--crm-border)", fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span>{ln}</span>
                      <span style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>{relativeTime(c.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>
                      {c.status.toLowerCase()}
                      {c.duration ? ` · ${c.duration}s` : ""}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="crm-card flush">
            <div className="crm-card-head">
              <h3>Open tasks</h3>
              <span className="crm-sub">· {openTasks.length}</span>
            </div>
            {openTasks.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "var(--crm-fg-faint)" }}>No open tasks.</div>
            ) : (
              openTasks.map((t: any) => (
                <div key={t.id} style={{ padding: "10px 14px", borderTop: "1px solid var(--crm-border)", fontSize: 13 }}>
                  <div>{t.title}</div>
                  {t.dueDate && (
                    <div style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>
                      Due {new Date(t.dueDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="crm-card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
