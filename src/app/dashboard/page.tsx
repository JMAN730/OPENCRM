"use client";

import { trpc } from "@/app/_trpc/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  DollarSign,
  Users,
  TrendingUp,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Download,
  MoreHorizontal,
  Plus,
  CheckCheck,
  Mail,
  FileText,
  Zap,
  Tag,
} from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

/* ── Static design data (used for visualizations & demo content) ── */
const PIPELINE = [
  { id: "lead",        label: "Lead",        count: 1248, value: 0,         pct: 100 },
  { id: "qualified",   label: "Qualified",   count: 412,  value: 6_180_000, pct: 33.0 },
  { id: "demo",        label: "Demo",        count: 168,  value: 3_360_000, pct: 13.5 },
  { id: "proposal",    label: "Proposal",    count: 74,   value: 1_850_000, pct: 5.9 },
  { id: "negotiation", label: "Negotiation", count: 31,   value:   930_000, pct: 2.5 },
  { id: "closed",      label: "Closed Won",  count: 18,   value:   612_000, pct: 1.4 },
];

const CONNECTIONS = [
  { label: "Connected · live",  value: 168, color: "var(--crm-accent)" },
  { label: "Voicemail · human", value: 88,  color: "oklch(74% 0.14 70)" },
  { label: "AI voicemail",      value: 62,  color: "oklch(70% 0.14 320)" },
  { label: "No answer",         value: 58,  color: "oklch(72% 0.06 80)" },
  { label: "Hung up",           value: 24,  color: "oklch(64% 0.18 25)" },
  { label: "Wrong number",      value: 12,  color: "oklch(70% 0.04 80)" },
];

const TASKS_STATIC = [
  { id: 1, label: "Send pricing deck to Helio Systems",         due: "Today",     done: false },
  { id: 2, label: "Follow up on Brightline timeline objection", due: "Today",     done: false },
  { id: 3, label: "Loop in CS for Lattice kickoff",             due: "Tomorrow",  done: false },
  { id: 4, label: "Refresh ICP scoring for Q2",                 due: "May 12",    done: true  },
  { id: 5, label: "Review scraper queue (28 new)",              due: "May 13",    done: false },
];

const ACTIVITY_STATIC = [
  { id: 1, kind: "deal",  ts: "2m",        html: 'Closed <strong>Lattice Robotics</strong> — Annual <strong>$48,000</strong>' },
  { id: 2, kind: "email", ts: "11m",       html: 'Sent proposal to <strong>Helio Systems</strong> <span style="color:var(--crm-fg-faint)">· seen 2 times</span>' },
  { id: 3, kind: "note",  ts: "38m",       html: '<strong>Riya Patel</strong> added a note on <strong>Northstack</strong>' },
  { id: 4, kind: "lead",  ts: "1h",        html: '<strong>14 new leads</strong> from scraper · <em>SaaS · 50–200 employees</em>' },
  { id: 5, kind: "task",  ts: "2h",        html: 'Task overdue: <strong>Confirm DocuSign with Brightline</strong>' },
  { id: 6, kind: "call",  ts: "3h",        html: 'Logged 18m call with <strong>Ines Bauer</strong> — verbal yes' },
];

const REVENUE_SPARK = [12, 18, 14, 22, 19, 28, 24, 31, 27, 34, 30, 39, 42, 47];
const LEADS_SPARK   = [40, 38, 44, 47, 42, 51, 49, 55, 53, 61, 58, 64, 67, 72];
const CONV_SPARK    = [11, 12, 11.5, 13, 12.6, 13.4, 13.1, 14.0, 13.8, 14.6, 14.3, 14.9, 15.2, 15.8];

/* ── Sparkline ── */
function Sparkline({ data, color = "var(--crm-accent)" }: { data: number[]; color?: string }) {
  const w = 220, h = 38, pad = 2;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => [pad + i * step, h - pad - ((v - min) / range) * (h - pad * 2)] as [number, number]);
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = path + ` L ${pts[pts.length - 1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;
  const last = pts[pts.length - 1];
  const safeId = color.replace(/[^a-z]/gi, "");
  return (
    <svg className="crm-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={"sp" + safeId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp${safeId})`} />
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

/* ── KPI Card ── */
function KPICard({
  label, icon: Icon, prefix = "", value, suffix = "",
  delta, deltaDir, compare, spark, sparkColor,
  goal,
}: {
  label: string;
  icon: React.ElementType;
  prefix?: string;
  value: string | number;
  suffix?: string;
  delta: string;
  deltaDir: "pos" | "neg" | "flat";
  compare: string;
  spark: number[];
  sparkColor?: string;
  goal?: { pct: number; label: string };
}) {
  return (
    <div className="crm-card crm-kpi">
      <div className="crm-kpi-label">
        <span className="crm-kpi-icon"><Icon size={13} /></span>
        {label}
      </div>
      <div className="crm-kpi-value">{prefix}{value}{suffix}</div>
      <Sparkline data={spark} color={sparkColor || "var(--crm-accent)"} />
      <div className="crm-kpi-foot">
        <span className={`crm-delta ${deltaDir}`}>
          {delta}
        </span>
        <span className="crm-compare">vs. {compare}</span>
      </div>
      {goal && (
        <div className="crm-goal-row">
          <div className="crm-goal-bar"><span style={{ width: goal.pct + "%" }} /></div>
          <div className="crm-goal-text">{goal.pct}% of {goal.label}</div>
        </div>
      )}
    </div>
  );
}

/* ── Donut Chart ── */
function DonutChart({ data, total }: { data: typeof CONNECTIONS; total: string }) {
  const size = 180, stroke = 22, r = (size - stroke) / 2 - 2, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const sum = data.reduce((s, d) => s + d.value, 0);
  let acc = 0;
  return (
    <div style={{ position: "relative" }}>
      <svg className="crm-donut-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--crm-surface-hover)" strokeWidth={stroke} />
        {data.map((d, i) => {
          const len = (d.value / sum) * C;
          const off = C - acc;
          acc += len;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={d.color} strokeWidth={stroke}
              strokeDasharray={`${len - 2} ${C - len + 2}`}
              strokeDashoffset={off}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="crm-donut-center">
        <div style={{ textAlign: "center" }}>
          <div className="crm-big">{total}</div>
          <div className="crm-lbl">connect rate</div>
        </div>
      </div>
    </div>
  );
}

/* ── Phone Reach Card ── */
function PhoneReachCard() {
  const data = CONNECTIONS;
  const sum = data.reduce((s, x) => s + x.value, 0);
  const connectRate = ((data[0].value / sum) * 100).toFixed(1);
  return (
    <div className="crm-card flush">
      <div className="crm-card-head">
        <h3>Phone reach</h3>
        <span className="crm-sub">· last 30 days · {sum} dials</span>
        <div className="crm-actions">
          <button className="crm-btn ghost icon" style={{ height: 26, width: 26 }}><MoreHorizontal size={14} /></button>
        </div>
      </div>
      <div className="crm-donut-wrap">
        <DonutChart data={data} total={connectRate + "%"} />
        <div style={{ textAlign: "center", marginTop: -8, fontSize: 11, color: "var(--crm-fg-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          live connect rate
        </div>
        <div className="crm-legend">
          {data.map((s, i) => (
            <div key={i} className="crm-legend-row">
              <span className="crm-swatch" style={{ background: s.color, width: 12, height: 12, borderRadius: 4 }} />
              <span>{s.label}</span>
              <span className="crm-pct">{((s.value / sum) * 100).toFixed(1)}%</span>
              <span className="crm-count">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Pipeline Card ── */
function PipelineCard() {
  const max = Math.max(...PIPELINE.map((p) => p.count));
  return (
    <div className="crm-card flush">
      <div className="crm-card-head">
        <h3>Pipeline</h3>
        <span className="crm-sub">· {PIPELINE[0].count.toLocaleString()} leads in flight</span>
        <div className="crm-actions">
          <span className="crm-ribbon">$13.0M open</span>
        </div>
      </div>
      <div className="crm-funnel">
        {PIPELINE.map((s) => (
          <div key={s.id} className="crm-funnel-row">
            <div className="crm-lbl">{s.label}</div>
            <div className="crm-bar">
              <span style={{ width: (s.count / max * 100) + "%" }}>
                {s.count.toLocaleString()}
              </span>
            </div>
            <div className="crm-num">
              ${(s.value / 1_000_000).toFixed(2)}M
              <span className="crm-pct">{s.pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tasks Card ── */
function TasksCard() {
  const [tasks, setTasks] = useState(TASKS_STATIC);
  const toggle = (id: number) => setTasks((ts) => ts.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  const open = tasks.filter((t) => !t.done).length;
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
      <div className="crm-tasks">
        {tasks.map((t) => (
          <div key={t.id} className="crm-task" data-done={t.done}>
            <div className="crm-check" onClick={() => toggle(t.id)}>
              {t.done && <CheckCheck size={11} />}
            </div>
            <div>
              <div className="crm-task-label">{t.label}</div>
            </div>
            <div className="crm-task-meta">{t.due}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Activity Card ── */
const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  deal: DollarSign, email: Mail, note: FileText,
  lead: Users, task: CheckCheck, call: Phone,
};

function ActivityCard() {
  return (
    <div className="crm-card flush">
      <div className="crm-card-head">
        <h3>Activity</h3>
        <span className="crm-sub">· today</span>
      </div>
      <div className="crm-activity">
        {ACTIVITY_STATIC.map((a) => {
          const Icon = ACTIVITY_ICONS[a.kind] ?? Zap;
          return (
            <div key={a.id} className="crm-activity-item">
              <div className="crm-dot"><Icon size={12} /></div>
              <div className="crm-body" dangerouslySetInnerHTML={{ __html: a.html }} />
              <div className="crm-ts">{a.ts}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Recent Calls Card (live data) ── */
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  CONNECTED: { label: "connected",  cls: "pos"  },
  NO_ANSWER: { label: "no answer",  cls: "neg"  },
  BUSY:      { label: "busy",       cls: "warn" },
  FAILED:    { label: "failed",     cls: "neg"  },
  CANCELED:  { label: "canceled",   cls: ""     },
};

function CallsCard() {
  const { data: stats } = trpc.dashboard.getKpiStats.useQuery();

  return (
    <div className="crm-card flush">
      <div className="crm-card-head">
        <h3>Recent calls</h3>
        <span className="crm-sub">· today</span>
        <div className="crm-actions">
          <button className="crm-btn ghost" style={{ height: 26, padding: "0 8px", fontSize: 12 }}>
            <Phone size={12} /> Open dialer
          </button>
          <button className="crm-btn ghost icon" style={{ height: 26, width: 26 }}><MoreHorizontal size={14} /></button>
        </div>
      </div>
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
          {stats?.recentCalls && stats.recentCalls.length > 0 ? (
            stats.recentCalls.map((call: { id: string; phone: string; status: string; duration?: number | null; createdAt: string }) => {
              const cfg = STATUS_MAP[call.status] ?? STATUS_MAP.FAILED;
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
                      <div className="crm-avatar sm c1" style={{ fontSize: 10 }}>
                        {call.phone.slice(-2)}
                      </div>
                      <div className="crm-meta">
                        <span className="crm-n">{call.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className={`crm-tag ${cfg.cls}`}>{cfg.label}</span></td>
                  <td className="mono">{duration}</td>
                  <td className="mono right">
                    {formatDistanceToNow(new Date(call.createdAt), { addSuffix: true })}
                  </td>
                </tr>
              );
            })
          ) : (
            /* Fallback static calls for demo */
            [
              { id: 1, name: "Maya Reyes",       co: "Lattice Robotics", outcome: "connected", dur: "12:48", when: "2m ago",  cls: "pos",  type: "out" },
              { id: 2, name: "Daniel Okafor",     co: "Northstack",       outcome: "voicemail", dur: "0:42",  when: "14m ago", cls: "warn", type: "out" },
              { id: 3, name: "Sofia Marchetti",   co: "Helio Systems",    outcome: "connected", dur: "27:11", when: "38m ago", cls: "pos",  type: "in"  },
              { id: 4, name: "Jules Park",        co: "Clarity Labs",     outcome: "no answer", dur: "0:00",  when: "1h ago",  cls: "neg",  type: "out" },
              { id: 5, name: "Ravi Chandran",     co: "Brightline",       outcome: "connected", dur: "6:22",  when: "2h ago",  cls: "pos",  type: "out" },
            ].map((c) => (
              <tr key={c.id}>
                <td className="mono" style={{ paddingRight: 0, width: 32 }}>
                  {c.type === "in" ? <PhoneIncoming size={13} /> : <PhoneOutgoing size={13} />}
                </td>
                <td>
                  <div className="crm-contact-cell">
                    <div className={`crm-avatar sm c${c.id}`}>
                      {c.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="crm-meta">
                      <span className="crm-n">{c.name}</span>
                      <span className="crm-c">{c.co}</span>
                    </div>
                  </div>
                </td>
                <td><span className={`crm-tag ${c.cls}`}>{c.outcome}</span></td>
                <td className="mono">{c.dur}</td>
                <td className="mono right">{c.when}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ── Dashboard Page ── */
export default function DashboardPage() {
  const { data: stats } = trpc.dashboard.getKpiStats.useQuery();
  const [range, setRange] = useState("30D");

  const revenue = stats?.monthlyRevenue
    ? (stats.monthlyRevenue / 1000).toFixed(1) + "K"
    : "612.4K";
  const totalLeads = stats?.totalLeads?.toLocaleString() ?? "1,248";
  const convRate = typeof stats?.conversionRate === "string"
    ? parseFloat(stats.conversionRate)
    : 14.6;

  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Good afternoon, Jordan</h1>
            <div className="crm-page-sub">
              You have <strong style={{ color: "var(--crm-fg)" }}>3 calls</strong> scheduled and{" "}
              <strong style={{ color: "var(--crm-fg)" }}>$1.2M</strong> in open opportunities.
            </div>
          </div>
          <div className="crm-page-head-actions">
            <div className="crm-tabs" role="tablist">
              {["7D", "30D", "QTD", "YTD"].map((r) => (
                <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>
              ))}
            </div>
            <button className="crm-btn"><Download size={13} /> Export</button>
          </div>
        </div>

        <div className="crm-kpi-grid">
          <KPICard
            label="Revenue" icon={DollarSign} prefix="$" value={revenue}
            delta="+18.2%" deltaDir="pos" compare="last 30d"
            spark={REVENUE_SPARK}
            goal={{ pct: 76, label: "$800K target" }}
          />
          <KPICard
            label="Total leads" icon={Users} value={totalLeads}
            delta="+92" deltaDir="pos" compare="last 30d"
            spark={LEADS_SPARK} sparkColor="oklch(70% 0.13 200)"
            goal={{ pct: 62, label: "2,000 / Q2" }}
          />
          <KPICard
            label="Conversion rate" icon={TrendingUp} value={convRate.toFixed(1)} suffix="%"
            delta="+1.4 pp" deltaDir="pos" compare="last 30d"
            spark={CONV_SPARK} sparkColor="oklch(72% 0.14 145)"
            goal={{ pct: 88, label: "16.5% target" }}
          />
        </div>

        <div className="crm-grid-row">
          <CallsCard />
          <PhoneReachCard />
        </div>

        <div className="crm-grid-row">
          <PipelineCard />
          <TasksCard />
        </div>

        <ActivityCard />
      </div>
    </DashboardLayout>
  );
}
