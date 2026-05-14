"use client";

import { trpc } from "@/app/_trpc/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  DollarSign,
  Users,
  Phone,
  PhoneOutgoing,
  CheckCheck,
  Plus,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { formatDistanceToNow, format, isToday, isTomorrow } from "date-fns";

function formatDueDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
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
const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  CONNECTED: { label: "Connected",  color: "var(--crm-accent)" },
  BUSY:      { label: "Busy",       color: "oklch(74% 0.14 70)" },
  NO_ANSWER: { label: "No answer",  color: "oklch(72% 0.06 80)" },
  FAILED:    { label: "Failed",     color: "oklch(64% 0.18 25)" },
  CANCELED:  { label: "Canceled",   color: "oklch(70% 0.04 80)" },
};

function PhoneReachCard({ data }: { data: { status: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <div className="crm-card flush">
        <div className="crm-card-head"><h3>Phone reach</h3><span className="crm-sub">· 30 days</span></div>
        <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13 }}>No calls logged yet</div>
      </div>
    );
  }

  const connected = data.find((d) => d.status === "CONNECTED")?.count ?? 0;
  const connectRate = ((connected / total) * 100).toFixed(1);
  const size = 140, stroke = 20, r = (size - stroke) / 2 - 2, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const segments = data.map((d, i) => {
    const previous = data.slice(0, i).reduce((sum, item) => sum + item.count, 0);
    return {
      ...d,
      len: (d.count / total) * C,
      off: C - (previous / total) * C,
    };
  });

  return (
    <div className="crm-card flush">
      <div className="crm-card-head">
        <h3>Phone reach</h3>
        <span className="crm-sub">· last 30 days · {total} dials</span>
      </div>
      <div className="crm-donut-wrap">
        <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--crm-surface-hover)" strokeWidth={stroke} />
            {segments.map((d, i) => {
              const cfg = STATUS_DISPLAY[d.status];
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
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--crm-fg)" }}>{connectRate}%</div>
            <div style={{ fontSize: 10, color: "var(--crm-fg-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>connect</div>
          </div>
        </div>
        <div className="crm-legend">
          {data.map((d, i) => {
            const cfg = STATUS_DISPLAY[d.status];
            return (
              <div key={i} className="crm-legend-row">
                <span className="crm-swatch" style={{ background: cfg?.color ?? "var(--crm-fg-faint)", width: 10, height: 10, borderRadius: 3 }} />
                <span>{cfg?.label ?? d.status}</span>
                <span className="crm-pct">{((d.count / total) * 100).toFixed(1)}%</span>
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

function PipelineCard({ leadsByStatus }: { leadsByStatus: { status: string; count: number }[] }) {
  const total = leadsByStatus.reduce((s, d) => s + d.count, 0);
  const max = Math.max(...leadsByStatus.map((p) => p.count), 1);

  if (total === 0) {
    return (
      <div className="crm-card flush">
        <div className="crm-card-head"><h3>Pipeline</h3></div>
        <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13 }}>No leads yet — add your first lead to see the pipeline</div>
      </div>
    );
  }

  // Ensure they appear in the right order
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
  const open = taskList.filter((t: { completed: boolean }) => !t.completed).length;

  return (
    <div className="crm-card flush">
      <div className="crm-card-head">
        <h3>My tasks</h3>
        <span className="crm-sub">· {open} open</span>
        <div className="crm-actions">
          <button className="crm-btn ghost" style={{ height: 26, padding: "0 8px", fontSize: 12 }}>
            <Plus size={12} /> Add
          </button>
        </div>
      </div>
      {isLoading ? (
        <div className="crm-empty">Loading…</div>
      ) : displayed.length === 0 ? (
        <div className="crm-empty">No tasks yet.</div>
      ) : (
        <div className="crm-tasks">
          {displayed.map((t) => (
            <div key={t.id} className="crm-task" data-done={t.completed}>
              <div
                className="crm-check"
                onClick={() => update.mutate({ taskId: t.id, completed: !t.completed })}
              >
                {t.completed && <CheckCheck size={11} />}
              </div>
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
}: {
  recentCalls: { id: string; phone: string; status: string; duration?: number | null; createdAt: string }[];
  callsToday: number;
}) {
  return (
    <div className="crm-card flush">
      <div className="crm-card-head">
        <h3>Recent calls</h3>
        <span className="crm-sub">· {callsToday} today</span>
      </div>
      {recentCalls.length === 0 ? (
        <div className="crm-empty">No calls logged yet.</div>
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
              const cfg = CALL_STATUS_MAP[call.status] ?? { label: call.status, cls: "" };
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
                      <div className="crm-meta"><span className="crm-n">{call.phone}</span></div>
                    </div>
                  </td>
                  <td><span className={`crm-tag ${cfg.cls}`}>{cfg.label}</span></td>
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

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data: stats } = trpc.dashboard.getKpiStats.useQuery();

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const revenue = stats?.monthlyRevenue
    ? "$" + (stats.monthlyRevenue / 1000).toFixed(1) + "K"
    : "$0";
  const totalLeads = stats?.totalLeads?.toLocaleString() ?? "0";

  const followupsDue = stats?.followupsDue ?? 0;
  const callsToday = stats?.callsToday ?? 0;
  const leadsByStatus = stats?.leadsByStatus ?? [];
  const recentCalls = stats?.recentCalls ?? [];
  const statusDist = stats?.charts.statusDistribution ?? [];

  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">{greeting}, {firstName}</h1>
            <div className="crm-page-sub">
              {callsToday > 0 && (
                <><strong style={{ color: "var(--crm-fg)" }}>{callsToday}</strong> call{callsToday !== 1 ? "s" : ""} logged today · </>
              )}
              {followupsDue > 0
                ? <><strong style={{ color: "var(--crm-fg)" }}>{followupsDue}</strong> follow-up{followupsDue !== 1 ? "s" : ""} due</>
                : "No follow-ups due today"}
            </div>
          </div>
        </div>

        <div className="crm-kpi-grid">
          <KPICard label="Revenue · 30d" icon={DollarSign} value={revenue} />
          <KPICard label="Total leads" icon={Users} value={totalLeads} />
          <KPICard label="Calls today" icon={Phone} value={callsToday} />
        </div>

        <div className="crm-grid-row">
          <CallsCard recentCalls={recentCalls} callsToday={callsToday} />
          <PhoneReachCard data={statusDist} />
        </div>

        <div className="crm-grid-row">
          <PipelineCard leadsByStatus={leadsByStatus} />
          <TasksCard />
        </div>
      </div>
    </DashboardLayout>
  );
}
