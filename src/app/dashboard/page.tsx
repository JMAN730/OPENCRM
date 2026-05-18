"use client";

import { trpc } from "@/app/_trpc/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Users,
  Phone,
  PhoneOutgoing,
  CheckCheck,
  Plus,
  Flame,
  TrendingUp,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { formatDistanceToNow, format, isToday, isTomorrow } from "date-fns";
import Link from "next/link";
import { formatPhone } from "@/lib/phone";

function formatDueDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "MMM d");
}

/* ── KPI Card ── */
function KPICard({
  label, icon: Icon, value,
}: {
  label: string;
  icon: React.ElementType;
  value: string | number;
}) {
  return (
    <div className="crm-card crm-kpi">
      <div className="crm-kpi-label">
        <span className="crm-kpi-icon"><Icon size={13} /></span>
        {label}
      </div>
      <div className="crm-kpi-value">{value}</div>
    </div>
  );
}

/* ── Phone Reach Card ── */
const OUTCOME_DISPLAY: Record<string, { label: string; color: string }> = {
  ANSWERED:     { label: "Answered",     color: "var(--crm-accent)" },
  HUNG_UP:      { label: "Hung up",      color: "oklch(64% 0.18 25)" },
  NO_ANSWER:    { label: "No answer",    color: "oklch(72% 0.06 80)" },
  AI_VOICEMAIL: { label: "AI voicemail", color: "oklch(72% 0.12 270)" },
  CUSTOM:       { label: "Custom",       color: "oklch(70% 0.04 80)" },
};

function PhoneReachCard({ data, isLoading }: { data: { outcome: string; count: number }[]; isLoading: boolean }) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const grandTotal = data.reduce((s, d) => s + d.count, 0);

  if (grandTotal === 0) {
    return (
      <div className="crm-card flush">
        <div className="crm-card-head"><h3>Phone reach</h3><span className="crm-sub">· outcomes</span></div>
        <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13 }}>
          {isLoading ? "Loading…" : "No outcomes logged yet"}
        </div>
      </div>
    );
  }

  const toggle = (outcome: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(outcome) ? next.delete(outcome) : next.add(outcome);
      return next;
    });

  const visibleData = data.filter((d) => !excluded.has(d.outcome));
  const visibleTotal = visibleData.reduce((s, d) => s + d.count, 0);
  const answered = visibleData.find((d) => d.outcome === "ANSWERED")?.count ?? 0;
  const answerRate = visibleTotal > 0 ? ((answered / visibleTotal) * 100).toFixed(1) : "0.0";

  const size = 140, stroke = 20, r = (size - stroke) / 2 - 2, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const segments = visibleData.map((d, i) => {
    const previous = visibleData.slice(0, i).reduce((sum, item) => sum + item.count, 0);
    return {
      ...d,
      len: (d.count / visibleTotal) * C,
      off: C - (previous / visibleTotal) * C,
    };
  });

  return (
    <div className="crm-card flush">
      <div className="crm-card-head">
        <h3>Phone reach</h3>
        <span className="crm-sub">· {grandTotal} leads with outcomes</span>
      </div>
      <div className="crm-donut-wrap">
        <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--crm-surface-hover)" strokeWidth={stroke} />
            {visibleTotal === 0 ? null : segments.map((d, i) => {
              const cfg = OUTCOME_DISPLAY[d.outcome];
              return (
                <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                  stroke={cfg?.color ?? "var(--crm-fg-faint)"} strokeWidth={stroke}
                  strokeDasharray={`${d.len - 1} ${C - d.len + 1}`}
                  strokeDashoffset={d.off}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  strokeLinecap="butt"
                />
              );
            })}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--crm-fg)" }}>{answerRate}%</div>
            <div style={{ fontSize: 10, color: "var(--crm-fg-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>answered</div>
          </div>
        </div>
        <div className="crm-legend">
          {data.map((d, i) => {
            const cfg = OUTCOME_DISPLAY[d.outcome];
            const isExcluded = excluded.has(d.outcome);
            const pct = visibleTotal > 0 && !isExcluded
              ? ((d.count / visibleTotal) * 100).toFixed(1)
              : "—";
            return (
              <div
                key={i}
                className="crm-legend-row"
                onClick={() => toggle(d.outcome)}
                title={isExcluded ? "Click to include" : "Click to exclude"}
                style={{ cursor: "pointer", opacity: isExcluded ? 0.38 : 1, transition: "opacity 0.15s" }}
              >
                <span className="crm-swatch" style={{
                  background: isExcluded ? "var(--crm-fg-faint)" : (cfg?.color ?? "var(--crm-fg-faint)"),
                  width: 10, height: 10, borderRadius: 3,
                  transition: "background 0.15s",
                }} />
                <span style={{ textDecoration: isExcluded ? "line-through" : "none" }}>{cfg?.label ?? d.outcome}</span>
                <span className="crm-pct">{pct}</span>
                <span className="crm-count">{d.count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Pipeline Card ── */
const LEAD_STATUS_LABEL: Record<string, string> = {
  NOT_CONTACTED: "Not Contacted",
  CONNECTED:     "Connected",
  AI_VOICEMAIL:  "AI Voicemail",
  NO_ANSWER:     "No Answer",
  HUNG_UP:       "Hung Up",
};

const LEAD_STATUS_ORDER = ["NOT_CONTACTED", "NO_ANSWER", "AI_VOICEMAIL", "HUNG_UP", "CONNECTED"];

function PipelineCard({ leadsByStatus, isLoading }: { leadsByStatus: { status: string; count: number }[]; isLoading: boolean }) {
  const total = leadsByStatus.reduce((s, d) => s + d.count, 0);
  const max = Math.max(...leadsByStatus.map((p) => p.count), 1);

  if (total === 0) {
    return (
      <div className="crm-card flush">
        <div className="crm-card-head"><h3>Pipeline</h3></div>
        <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13 }}>
          {isLoading ? "Loading…" : "No leads yet — add your first lead to see the pipeline"}
        </div>
      </div>
    );
  }

  const orderedData = LEAD_STATUS_ORDER
    .map((s) => leadsByStatus.find((l) => l.status === s))
    .filter((l): l is { status: string; count: number } => !!l && l.count > 0);

  return (
    <div className="crm-card flush">
      <div className="crm-card-head">
        <h3>Pipeline</h3>
        <span className="crm-sub">· {total.toLocaleString()} leads</span>
      </div>
      <div className="crm-funnel">
        {orderedData.map((s) => (
          <div key={s.status} className="crm-funnel-row">
            <div className="crm-lbl">{LEAD_STATUS_LABEL[s.status] ?? s.status}</div>
            <div className="crm-bar">
              <span style={{ width: (s.count / max * 100) + "%" }}>
                {s.count.toLocaleString()}
              </span>
            </div>
            <div className="crm-num">
              <span className="crm-pct">{((s.count / total) * 100).toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TasksCard() {
  const { data, isLoading } = trpc.tasks.getAll.useQuery({ limit: 50 });
  const utils = trpc.useUtils();
  const update = trpc.tasks.update.useMutation({
    onSuccess: () => utils.tasks.getAll.invalidate(),
  });

  const taskList = data?.items ?? [];
  const displayed = taskList.slice(0, 5);
  const open = taskList.filter((t: { status: string }) => t.status !== "COMPLETED").length;

  return (
    <div className="crm-card flush">
      <div className="crm-card-head">
        <h3>My tasks</h3>
        <span className="crm-sub">· {open} open</span>
        <div className="crm-actions">
          <Link href="/tasks" className="crm-btn ghost" style={{ height: 26, padding: "0 8px", fontSize: 12 }}>
            <Plus size={12} /> Add
          </Link>
        </div>
      </div>
      {isLoading ? (
        <div className="crm-empty">Loading…</div>
      ) : displayed.length === 0 ? (
        <div className="crm-empty">No tasks yet.</div>
      ) : (
        <div className="crm-tasks">
          {displayed.map((t) => (
            <div key={t.id} className="crm-task" data-done={t.status === "COMPLETED"}>
              <button
                type="button"
                className="crm-check"
                onClick={() => update.mutate({ taskId: t.id, status: t.status !== "COMPLETED" ? "COMPLETED" : "PENDING" })}
                aria-label={t.status === "COMPLETED" ? `Reopen task ${t.title}` : `Complete task ${t.title}`}
              >
                {t.status === "COMPLETED" && <CheckCheck size={11} />}
              </button>
              <div>
                <div className="crm-task-label">{t.title}</div>
              </div>
              <div className="crm-task-meta">{formatDueDate(t.dueDate)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Recent Calls Card ── */
const CALL_OUTCOME_MAP: Record<string, { label: string; cls: string }> = {
  ANSWERED:      { label: "answered",     cls: "pos"  },
  HUNG_UP:       { label: "hung up",      cls: "neg"  },
  NO_ANSWER:     { label: "no answer",    cls: "neg"  },
  AI_VOICEMAIL:  { label: "AI voicemail", cls: "warn" },
  CUSTOM:        { label: "custom",       cls: ""     },
  NOT_CONTACTED: { label: "not contacted", cls: ""    },
};

const CALL_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  CONNECTED: { label: "connected", cls: "pos"  },
  NO_ANSWER: { label: "no answer", cls: "neg"  },
  BUSY:      { label: "busy",      cls: "warn" },
  FAILED:    { label: "failed",    cls: "neg"  },
  CANCELED:  { label: "canceled",  cls: ""     },
};

function CallsCard({
  recentCalls,
  callsToday,
  isLoading,
}: {
  recentCalls: { id: string; phone: string; status: string; callOutcome?: string | null; duration?: number | null; createdAt: string }[];
  callsToday: number;
  isLoading: boolean;
}) {
  return (
    <div className="crm-card flush">
      <div className="crm-card-head">
        <h3>Recent calls</h3>
        <span className="crm-sub">· {isLoading ? "—" : callsToday} today</span>
      </div>
      {recentCalls.length === 0 ? (
        <div className="crm-empty">{isLoading ? "Loading…" : "No calls logged yet."}</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Contact</th>
              <th>Outcome</th>
              <th>Duration</th>
              <th className="right">When</th>
            </tr>
          </thead>
          <tbody>
            {recentCalls.map((call) => {
              const outcomeCfg = call.callOutcome && call.callOutcome !== "NOT_CONTACTED"
                ? (CALL_OUTCOME_MAP[call.callOutcome] ?? { label: call.callOutcome, cls: "" })
                : null;
              const statusCfg = CALL_STATUS_MAP[call.status] ?? { label: call.status, cls: "" };
              const duration = call.duration
                ? `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, "0")}`
                : "0:00";
              return (
                <tr key={call.id}>
                  <td className="mono" style={{ paddingRight: 0, width: 32 }}>
                    <PhoneOutgoing size={13} />
                  </td>
                  <td>
                    <div className="crm-contact-cell">
                      <div className="crm-avatar sm c1" style={{ fontSize: 10 }}>{call.phone.slice(-2)}</div>
                      <div className="crm-meta"><span className="crm-n">{formatPhone(call.phone)}</span></div>
                    </div>
                  </td>
                  <td>
                    {outcomeCfg
                      ? <span className={`crm-tag ${outcomeCfg.cls}`}>{outcomeCfg.label}</span>
                      : <span className={`crm-tag ${statusCfg.cls}`}>{statusCfg.label}</span>}
                  </td>
                  <td className="mono">{duration}</td>
                  <td className="mono right">
                    {formatDistanceToNow(new Date(call.createdAt), { addSuffix: true })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Team Stats Tab ── */
function TeamStatsTab() {
  const { data: teamStats, isLoading } = trpc.dashboard.getTeamStats.useQuery();

  if (isLoading) return <div className="crm-empty">Loading team stats…</div>;
  if (!teamStats) return <div className="crm-empty">No team data available.</div>;

  const { totalCalls, callsThisWeek, leadsContacted, hotLeads, conversionRate, memberStats } = teamStats;

  return (
    <div>
      <div className="crm-kpi-grid">
        <KPICard label="Total calls" icon={Phone} value={totalCalls.toLocaleString()} />
        <KPICard label="Calls this week" icon={PhoneOutgoing} value={callsThisWeek.toLocaleString()} />
        <KPICard label="Leads contacted" icon={Users} value={leadsContacted.toLocaleString()} />
        <KPICard label="Hot leads" icon={Flame} value={hotLeads.toLocaleString()} />
        <KPICard label="Conversion rate" icon={TrendingUp} value={conversionRate} />
      </div>

      <div className="crm-card flush" style={{ marginTop: 20 }}>
        <div className="crm-card-head">
          <h3>Activity by team member</h3>
          <span className="crm-sub">· {memberStats.length} members</span>
        </div>
        {memberStats.length === 0 ? (
          <div className="crm-empty">No activity yet.</div>
        ) : (
          <table className="crm-table">
            <thead>
              <tr>
                <th>Member</th>
                <th className="right">Calls</th>
                <th className="right">Leads assigned</th>
                <th className="right">Last active</th>
              </tr>
            </thead>
            <tbody>
              {memberStats
                .sort((a, b) => (b.callCount ?? 0) - (a.callCount ?? 0))
                .map((m) => (
                  <tr key={m.userId}>
                    <td>
                      <div className="crm-contact-cell">
                        <div className="crm-avatar sm c2" style={{ fontSize: 11 }}>
                          {(m.name ?? m.email ?? "?")
                            .split(" ")
                            .map((p: string) => p[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </div>
                        <div className="crm-meta">
                          <span className="crm-n">{m.name || "—"}</span>
                          <span style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>{m.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="right mono">{m.callCount}</td>
                    <td className="right mono">{m.leadsAssigned}</td>
                    <td className="right mono" style={{ fontSize: 12, color: "var(--crm-fg-faint)" }}>
                      {m.lastActive
                        ? formatDistanceToNow(new Date(m.lastActive), { addSuffix: true })
                        : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── My Stats Tab ── */
const ACTIVITY_LABEL: Record<string, string> = {
  LEAD_CREATED: "Created lead",
  LEAD_ASSIGNED: "Assigned lead",
  LEAD_DELETED: "Deleted lead",
  CALL_OUTCOME: "Updated call outcome",
  CALL_LOGGED: "Logged call",
  LEAD_TEMPERATURE_OVERRIDE: "Updated lead temperature",
  TASK_CREATED: "Added task",
  TASK_COMPLETED: "Completed task",
  NOTE_ADDED: "Added note",
  NOTE_DELETED: "Deleted note",
};

function MyStatsTab() {
  const { data: myStats, isLoading } = trpc.dashboard.getMyStats.useQuery();

  if (isLoading) return <div className="crm-empty">Loading your stats…</div>;
  if (!myStats) return <div className="crm-empty">No data yet.</div>;

  return (
    <div>
      <div className="crm-kpi-grid">
        <KPICard label="Calls today" icon={Phone} value={myStats.callsToday} />
        <KPICard label="Calls this week" icon={PhoneOutgoing} value={myStats.callsThisWeek} />
        <KPICard label="Leads assigned" icon={Users} value={myStats.leadsAssigned} />
        <KPICard label="Open tasks" icon={CheckCheck} value={myStats.openTasks} />
      </div>

      <div className="crm-card flush" style={{ marginTop: 20 }}>
        <div className="crm-card-head">
          <h3>Recent activity</h3>
          <span className="crm-sub">· last {myStats.recentActivity.length}</span>
        </div>
        {myStats.recentActivity.length === 0 ? (
          <div className="crm-empty">No recent activity yet.</div>
        ) : (
          <div>
            {myStats.recentActivity.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 16px",
                  borderTop: "1px solid var(--crm-border)",
                  alignItems: "flex-start",
                }}
              >
                <Activity size={14} style={{ color: "var(--crm-fg-faint)", marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: "var(--crm-fg-faint)" }}>
                      {ACTIVITY_LABEL[a.type] ?? a.type}
                    </span>
                    {a.lead ? <> · <strong>{a.lead.name}</strong></> : null}
                  </div>
                  {a.description && (
                    <div style={{ fontSize: 11.5, color: "var(--crm-fg-faint)", marginTop: 1 }}>
                      {a.description}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", flexShrink: 0 }}>
                  {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Dashboard Page ── */
type DashboardTab = "overview" | "team" | "my-stats";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.getKpiStats.useQuery();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const placeholder = statsLoading ? "—" : null;
  const connected30d = stats?.connectedLast30d != null
    ? stats.connectedLast30d.toLocaleString()
    : (placeholder ?? "0");
  const totalLeads = stats?.totalLeads != null
    ? stats.totalLeads.toLocaleString()
    : (placeholder ?? "0");

  const followupsDue = stats?.followupsDue ?? 0;
  const callsToday = stats?.callsToday ?? 0;
  const leadsByStatus = stats?.leadsByStatus ?? [];
  const recentCalls = stats?.recentCalls ?? [];
  const outcomeDist = stats?.charts.outcomeDistribution ?? [];

  const tabs: { id: DashboardTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "team", label: "Team" },
    { id: "my-stats", label: "My Stats" },
  ];

  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">{greeting}, {firstName}</h1>
            <div className="crm-page-sub">
              {statsLoading ? (
                "Loading your activity…"
              ) : (
                <>
                  {callsToday > 0 && (
                    <><strong style={{ color: "var(--crm-fg)" }}>{callsToday}</strong> call{callsToday !== 1 ? "s" : ""} logged today · </>
                  )}
                  {followupsDue > 0
                    ? <><strong style={{ color: "var(--crm-fg)" }}>{followupsDue}</strong> follow-up{followupsDue !== 1 ? "s" : ""} due</>
                    : "No follow-ups due today"}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--crm-border)", paddingBottom: 0 }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? "var(--crm-fg)" : "var(--crm-fg-faint)",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid var(--crm-accent)" : "2px solid transparent",
                cursor: "pointer",
                marginBottom: -1,
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <>
            <div className="crm-kpi-grid">
              <KPICard label="Connected · 30d" icon={CheckCircle2} value={connected30d} />
              <KPICard label="Total leads" icon={Users} value={totalLeads} />
              <KPICard label="Calls today" icon={Phone} value={!stats && statsLoading ? "—" : callsToday} />
            </div>

            <div className="crm-grid-row">
              <CallsCard recentCalls={recentCalls} callsToday={callsToday} isLoading={statsLoading} />
              <PhoneReachCard data={outcomeDist} isLoading={statsLoading} />
            </div>

            <div className="crm-grid-row">
              <PipelineCard leadsByStatus={leadsByStatus} isLoading={statsLoading} />
              <TasksCard />
            </div>
          </>
        )}

        {activeTab === "team" && <TeamStatsTab />}
        {activeTab === "my-stats" && <MyStatsTab />}
      </div>
    </DashboardLayout>
  );
}
