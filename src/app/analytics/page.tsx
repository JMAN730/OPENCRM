"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { trpc } from "@/app/_trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

type Lead = inferRouterOutputs<AppRouter>["leads"]["getAll"][number];

const LEAD_STATUS_ORDER = ["NOT_CONTACTED", "NO_ANSWER", "AI_VOICEMAIL", "HUNG_UP", "CONNECTED"];
const LEAD_STATUS_LABEL: Record<string, string> = {
  NOT_CONTACTED: "Not Contacted", NO_ANSWER: "No Answer", AI_VOICEMAIL: "AI Voicemail",
  HUNG_UP: "Hung Up", CONNECTED: "Connected",
};

const CALL_STATUS_LABEL: Record<string, string> = {
  CONNECTED: "Connected", NO_ANSWER: "No answer",
  BUSY: "Busy", FAILED: "Failed", CANCELED: "Canceled",
};
const CALL_STATUS_COLOR: Record<string, string> = {
  CONNECTED: "var(--crm-pos)", NO_ANSWER: "var(--crm-neg)",
  BUSY: "var(--crm-warn)", FAILED: "var(--crm-neg)", CANCELED: "var(--crm-fg-faint)",
};

function KPICard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="crm-card crm-kpi">
      <div className="crm-kpi-label">{label}</div>
      <div className="crm-kpi-value">{value}</div>
      {note && <div className="crm-kpi-foot"><span className="crm-compare">{note}</span></div>}
    </div>
  );
}

export default function AnalyticsPage() {
  const { data: stats } = trpc.dashboard.getKpiStats.useQuery();
  const { data: leadsRaw } = trpc.leads.getAll.useQuery();
  const leads: Lead[] = leadsRaw ?? [];

  const revenue = stats?.monthlyRevenue
    ? "$" + (stats.monthlyRevenue >= 1000 ? (stats.monthlyRevenue / 1000).toFixed(1) + "K" : stats.monthlyRevenue.toFixed(0))
    : "$0";

  const callsPerDay = stats?.charts?.callsPerDay ?? [];
  const maxCalls = Math.max(...callsPerDay.map((d) => d.count), 1);

  const statusDist = stats?.charts?.statusDistribution ?? [];
  const totalCalls = statusDist.reduce((s: number, d: { status: string; count: number }) => s + d.count, 0);

  const leadCounts: Record<string, number> = {};
  leads.forEach((l) => { leadCounts[l.status] = (leadCounts[l.status] ?? 0) + 1; });
  const pipelineRows = LEAD_STATUS_ORDER.map((s) => ({ status: s, count: leadCounts[s] ?? 0 })).filter((r) => r.count > 0);
  const maxLeads = Math.max(...pipelineRows.map((r) => r.count), 1);

  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Analytics</h1>
            <div className="crm-page-sub">Pipeline, activity, and revenue metrics</div>
          </div>
        </div>

        <div className="crm-kpi-grid">
          <KPICard label="Revenue · 30d" value={revenue} note="Won deals" />
          <KPICard label="Total leads" value={leads.length.toLocaleString()} note={`${stats?.conversionRate ?? "0.0%"} conversion rate`} />
          <KPICard label="Calls today" value={stats?.callsToday ?? 0} note={`${totalCalls} calls · 30d`} />
        </div>

        {/* Calls per day */}
        <div className="crm-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Calls per day</h3>
            <span style={{ marginLeft: "auto", color: "var(--crm-fg-faint)", fontSize: 12, fontFamily: "var(--crm-font-mono)" }}>last 7 days</span>
          </div>
          {callsPerDay.length === 0 || callsPerDay.every((d) => d.count === 0) ? (
            <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--crm-fg-faint)", fontSize: 13 }}>
              No calls logged yet
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120 }}>
              {callsPerDay.map((d, i) => {
                const isToday = i === callsPerDay.length - 1;
                const label = new Date(d.date).toLocaleDateString("en-US", { weekday: "short" });
                return (
                  <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      <div style={{
                        height: `${(d.count / maxCalls) * 100}%`, minHeight: d.count > 0 ? 4 : 0,
                        background: isToday ? "var(--crm-accent)" : "var(--crm-accent-soft)",
                        borderRadius: "4px 4px 0 0",
                        border: isToday ? "none" : "1px solid color-mix(in oklch, var(--crm-accent) 20%, transparent)",
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", fontFamily: "var(--crm-font-mono)" }}>{label}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Pipeline by stage */}
          <div className="crm-card" style={{ padding: 24 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 500 }}>Pipeline by stage</h3>
            {pipelineRows.length === 0 ? (
              <div style={{ color: "var(--crm-fg-faint)", fontSize: 13 }}>No leads yet</div>
            ) : (
              pipelineRows.map((row) => (
                <div key={row.status} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, fontSize: 13 }}>
                  <div style={{ width: 88, color: "var(--crm-fg-muted)", flexShrink: 0 }}>{LEAD_STATUS_LABEL[row.status]}</div>
                  <div style={{ flex: 1, height: 6, background: "var(--crm-surface-2)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${(row.count / maxLeads) * 100}%`, height: "100%", background: "var(--crm-accent)", borderRadius: 3 }} />
                  </div>
                  <div style={{ width: 28, textAlign: "right", fontFamily: "var(--crm-font-mono)", color: "var(--crm-fg-muted)" }}>{row.count}</div>
                </div>
              ))
            )}
          </div>

          {/* Call outcomes */}
          <div className="crm-card" style={{ padding: 24 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 500 }}>Call outcomes · 30d</h3>
            {statusDist.length === 0 ? (
              <div style={{ color: "var(--crm-fg-faint)", fontSize: 13 }}>No calls logged yet</div>
            ) : (
              statusDist.map((row: { status: string; count: number }) => (
                <div key={row.status} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, fontSize: 13 }}>
                  <div style={{ width: 88, color: "var(--crm-fg-muted)", flexShrink: 0 }}>{CALL_STATUS_LABEL[row.status] ?? row.status}</div>
                  <div style={{ flex: 1, height: 6, background: "var(--crm-surface-2)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${(row.count / totalCalls) * 100}%`, height: "100%", background: CALL_STATUS_COLOR[row.status] ?? "var(--crm-fg-faint)", borderRadius: 3 }} />
                  </div>
                  <div style={{ width: 36, textAlign: "right", fontFamily: "var(--crm-font-mono)", color: "var(--crm-fg-muted)" }}>{row.count}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
