"use client";

import Link from "next/link";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { trpc } from "@/app/_trpc/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

const LEAD_STATUS_ORDER = ["NOT_CONTACTED", "NO_ANSWER", "AI_VOICEMAIL", "HUNG_UP", "CONNECTED"];
const LEAD_STATUS_LABEL: Record<string, string> = {
  NOT_CONTACTED: "Not contacted",
  NO_ANSWER: "No answer",
  AI_VOICEMAIL: "Voicemail",
  HUNG_UP: "Hung up",
  CONNECTED: "Connected",
};
const LEAD_STATUS_COLOR: Record<string, string> = {
  NOT_CONTACTED: "var(--crm-fg-faint)",
  NO_ANSWER: "var(--crm-warn)",
  AI_VOICEMAIL: "oklch(70% 0.14 290)",
  HUNG_UP: "var(--crm-neg)",
  CONNECTED: "var(--crm-pos)",
};

const TEMP_LABEL: Record<string, string> = { HOT: "Hot", WARM: "Warm", COOL: "Cool", Auto: "Auto" };
const TEMP_COLOR: Record<string, string> = {
  HOT: "var(--crm-neg)",
  WARM: "var(--crm-warn)",
  COOL: "oklch(72% 0.11 230)",
  Auto: "var(--crm-fg-faint)",
};

function fmt(n: number) { return n.toLocaleString(); }

function pct(part: number, total: number) {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "0%";
}

// ── Primitive chart components ────────────────────────────────────────────────

function BarChart({
  data,
  height = 100,
  accent = "var(--crm-accent)",
  accentSoft = "var(--crm-accent-soft)",
  showLabels = true,
}: {
  data: Array<{ date: string; count: number }>;
  height?: number;
  accent?: string;
  accentSoft?: string;
  showLabels?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const isEmpty = data.every((d) => d.count === 0);

  if (isEmpty) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--crm-fg-faint)", fontSize: 13 }}>
        No data yet
      </div>
    );
  }

  const labelEvery = data.length > 14 ? Math.ceil(data.length / 6) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: data.length > 14 ? 3 : 8, height }}>
        {data.map((d, i) => {
          const isLast = i === data.length - 1;
          return (
            <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0, height: "100%" }}>
              <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div
                  title={`${d.date}: ${d.count}`}
                  style={{
                    height: `${(d.count / max) * 100}%`,
                    minHeight: d.count > 0 ? 3 : 0,
                    background: isLast ? accent : accentSoft,
                    borderRadius: "3px 3px 0 0",
                    transition: "height 0.2s",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div style={{ display: "flex", gap: data.length > 14 ? 3 : 8 }}>
          {data.map((d, i) => {
            const showLabel = i % labelEvery === 0 || i === data.length - 1;
            return (
              <div key={d.date} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--crm-fg-faint)", fontFamily: "var(--crm-font-mono)", overflow: "hidden", whiteSpace: "nowrap" }}>
                {showLabel ? new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 10 }}>
      <div style={{ width: 96, color: "var(--crm-fg-muted)", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ flex: 1, height: 6, background: "var(--crm-surface-2)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${(count / Math.max(max, 1)) * 100}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <div style={{ width: 36, textAlign: "right", fontFamily: "var(--crm-font-mono)", color: "var(--crm-fg-muted)", flexShrink: 0 }}>{fmt(count)}</div>
    </div>
  );
}

function RateBar({ label, rate, sample, color }: { label: string; rate: number; sample: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 10 }}>
      <div style={{ width: 130, color: "var(--crm-fg-muted)", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ flex: 1, height: 6, background: "var(--crm-surface-2)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(rate, 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <div style={{ width: 78, textAlign: "right", fontFamily: "var(--crm-font-mono)", color: "var(--crm-fg-muted)", flexShrink: 0, fontSize: 12 }}>{rate}% · {sample}</div>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="crm-card crm-kpi">
      <div className="crm-kpi-label">{label}</div>
      <div className="crm-kpi-value">{value}</div>
      {sub && <div className="crm-kpi-foot"><span className="crm-compare">{sub}</span></div>}
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--crm-fg)" }}>{title}</h3>
      {sub && <span style={{ fontSize: 12, color: "var(--crm-fg-faint)", fontFamily: "var(--crm-font-mono)" }}>{sub}</span>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { data: overview, isLoading } = trpc.analytics.overview.useQuery();
  const { data: teamData } = trpc.dashboard.getTeamStats.useQuery();
  const { data: kpiData } = trpc.dashboard.getKpiStats.useQuery();
  const { data: topCallers } = trpc.analytics.topCallers.useQuery();
  const { data: repPerf } = trpc.analytics.repPerformance.useQuery();
  const { data: leadQuality } = trpc.analytics.leadQuality.useQuery();

  // Merge calling stats with per-rep performance (pipeline value) by userId.
  const perfById = new Map((repPerf ?? []).map((r) => [r.userId, r]));
  const leaderboard = (topCallers ?? []).map((c) => ({
    ...c,
    pipelineValue: perfById.get(c.userId)?.pipelineValue ?? 0,
  }));
  const topNiches = (leadQuality?.byNiche ?? []).filter((n) => n.total >= 3).slice(0, 6);
  const topCities = (leadQuality?.byCity ?? []).filter((c) => c.total >= 3).slice(0, 6);

  const kpis = overview?.kpis;
  const leadsPerDay = overview?.leadsPerDay ?? [];
  const callsPerDay = overview?.callsPerDay ?? [];
  const touchDepth = overview?.touchDepth ?? { untouched: 0, one: 0, twoToFive: 0, sixPlus: 0 };
  const bySource = overview?.bySource ?? [];
  const byTemperature = overview?.byTemperature ?? [];
  const memberStats = teamData?.memberStats ?? [];

  const leadsByStatus = kpiData?.leadsByStatus ?? [];
  const maxLeadsByStatus = Math.max(...leadsByStatus.map((r) => r.count), 1);
  const totalTouched = (kpis?.totalLeads ?? 0) - touchDepth.untouched;
  const touchTotal = Object.values(touchDepth).reduce((a, b) => a + b, 0);
  const maxSource = Math.max(...bySource.map((s) => s.count), 1);
  const maxTemp = Math.max(...byTemperature.map((t) => t.count), 1);
  const maxMemberCalls = Math.max(...memberStats.map((m) => m.callCount), 1);

  return (
    <DashboardLayout>
      <PageShell
        title="Analytics"
        subtitle="All-time totals with 7- and 30-day activity trends"
      >
        {/* ── KPI strip ── */}
        <div className="crm-kpi-grid">
          <KpiCard label="Total leads" value={fmt(kpis?.totalLeads ?? 0)} sub="all time" />
          <KpiCard label="Added this week" value={fmt(kpis?.leadsThisWeek ?? 0)} sub="new leads · 7d" />
          <KpiCard label="Calls this week" value={fmt(kpis?.callsThisWeek ?? 0)} sub="logged · 7d" />
          <KpiCard label="Connected" value={fmt(kpis?.connectedCount ?? 0)} sub="all time · in pipeline" />
          <KpiCard label="Contact rate" value={`${kpis?.contactRate ?? "0.0"}%`} sub={`all time · ${fmt(totalTouched)} of ${fmt(kpis?.totalLeads ?? 0)} touched`} />
        </div>

        {/* ── Rep leaderboard ── */}
        {leaderboard.length > 0 && (
          <div className="crm-card flush">
            <div className="crm-card-head">
              <h3>Rep leaderboard</h3>
              <span className="crm-sub">· all-time calling and pipeline performance</span>
            </div>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Rep</th>
                  <th>Calls</th>
                  <th>Connected</th>
                  <th>Connect rate</th>
                  <th>Conversions</th>
                  <th>Close rate</th>
                  <th>Pipeline value</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r) => (
                  <tr key={r.userId}>
                    <td>
                      <Link href={`/team/${r.userId}`} style={{ color: "var(--crm-accent)", fontWeight: 500 }}>
                        {r.name}
                      </Link>
                    </td>
                    <td className="mono">{fmt(r.totalCalls)}</td>
                    <td className="mono">{fmt(r.connectedCalls)}</td>
                    <td className="mono">{r.connectionRate}%</td>
                    <td className="mono">{fmt(r.conversions)}</td>
                    <td className="mono">{r.closeRate}%</td>
                    <td className="mono">{r.pipelineValue > 0 ? `$${fmt(r.pipelineValue)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Lead quality: niche & city conversion ── */}
        {(topNiches.length > 0 || topCities.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="crm-card" style={{ padding: 24 }}>
              <SectionHead title="Top niches by conversion" sub="all time · ≥3 leads" />
              {topNiches.length === 0 ? (
                <div style={{ color: "var(--crm-fg-faint)", fontSize: 13 }}>Not enough data yet</div>
              ) : (
                topNiches.map((n) => (
                  <RateBar key={n.key} label={n.key} rate={n.conversionRate} sample={`${n.converted}/${n.total}`} color="var(--crm-pos)" />
                ))
              )}
            </div>
            <div className="crm-card" style={{ padding: 24 }}>
              <SectionHead title="Top cities by conversion" sub="all time · ≥3 leads" />
              {topCities.length === 0 ? (
                <div style={{ color: "var(--crm-fg-faint)", fontSize: 13 }}>Not enough data yet</div>
              ) : (
                topCities.map((c) => (
                  <RateBar key={c.key} label={c.key} rate={c.conversionRate} sample={`${c.converted}/${c.total}`} color="var(--crm-accent)" />
                ))
              )}
            </div>
          </div>
        )}

        {/* ── 30-day trends ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="crm-card" style={{ padding: 24 }}>
            <SectionHead title="Calls per day" sub="last 30 days" />
            <BarChart data={callsPerDay} height={110} />
          </div>
          <div className="crm-card" style={{ padding: 24 }}>
            <SectionHead title="New leads per day" sub="last 30 days" />
            <BarChart
              data={leadsPerDay}
              height={110}
              accent="var(--crm-pos)"
              accentSoft="color-mix(in oklch, var(--crm-pos) 25%, transparent)"
            />
          </div>
        </div>

        {/* ── Pipeline health ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {/* Touch depth */}
          <div className="crm-card" style={{ padding: 24 }}>
            <SectionHead title="Touch depth" sub="all-time leads" />
            {isLoading ? (
              <div style={{ color: "var(--crm-fg-faint)", fontSize: 13 }}>Loading…</div>
            ) : (
              <>
                {[
                  { label: "Never touched", count: touchDepth.untouched, color: "var(--crm-fg-faint)" },
                  { label: "1 touch", count: touchDepth.one, color: "var(--crm-warn)" },
                  { label: "2–5 touches", count: touchDepth.twoToFive, color: "var(--crm-accent)" },
                  { label: "6+ touches", count: touchDepth.sixPlus, color: "var(--crm-pos)" },
                ].map(({ label, count, color }) => (
                  <HBar key={label} label={label} count={count} max={touchTotal} color={color} />
                ))}
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--crm-fg-faint)" }}>
                  {pct(touchDepth.untouched, touchTotal)} untouched · {pct(touchTotal - touchDepth.untouched, touchTotal)} contacted
                </div>
              </>
            )}
          </div>

          {/* Lead status */}
          <div className="crm-card" style={{ padding: 24 }}>
            <SectionHead title="Pipeline by status" sub="all time" />
            {LEAD_STATUS_ORDER.map((s) => {
              const row = leadsByStatus.find((r) => r.status === s);
              const count = row?.count ?? 0;
              return (
                <HBar key={s} label={LEAD_STATUS_LABEL[s]} count={count} max={maxLeadsByStatus} color={LEAD_STATUS_COLOR[s]} />
              );
            })}
          </div>

          {/* Temperature */}
          <div className="crm-card" style={{ padding: 24 }}>
            <SectionHead title="Lead temperature" sub="all time" />
            {byTemperature.length === 0 ? (
              <div style={{ color: "var(--crm-fg-faint)", fontSize: 13 }}>No temperature data yet</div>
            ) : (
              byTemperature.map(({ temperature, count }) => (
                <HBar
                  key={temperature}
                  label={TEMP_LABEL[temperature] ?? temperature}
                  count={count}
                  max={maxTemp}
                  color={TEMP_COLOR[temperature] ?? "var(--crm-fg-faint)"}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Lead sources ── */}
        {bySource.length > 0 && (
          <div className="crm-card" style={{ padding: 24 }}>
            <SectionHead title="Lead sources" sub="all time" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px" }}>
              {bySource.map(({ source, count }) => (
                <HBar key={source} label={source} count={count} max={maxSource} color="var(--crm-accent)" />
              ))}
            </div>
          </div>
        )}

        {/* ── Team leaderboard ── */}
        {memberStats.length > 0 && (
          <div className="crm-card flush">
            <div className="crm-card-head">
              <h3>Team activity</h3>
              <span className="crm-sub">· all time</span>
            </div>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Calls logged</th>
                  <th style={{ width: 180 }}>Call activity</th>
                  <th>Leads assigned</th>
                  <th>Last active</th>
                </tr>
              </thead>
              <tbody>
                {[...memberStats]
                  .sort((a, b) => b.callCount - a.callCount)
                  .map((m) => (
                    <tr key={m.userId}>
                      <td>
                        <div className="crm-contact-cell">
                          <div className="crm-avatar sm c1">{initials(m.name ?? m.email ?? "?")}</div>
                          <div className="crm-meta">
                            <span className="crm-n">{m.name ?? "—"}</span>
                            <span className="crm-c">{m.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="mono">{fmt(m.callCount)}</td>
                      <td>
                        <div style={{ height: 6, background: "var(--crm-surface-2)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${(m.callCount / Math.max(maxMemberCalls, 1)) * 100}%`, height: "100%", background: "var(--crm-accent)", borderRadius: 3 }} />
                        </div>
                      </td>
                      <td className="mono">{fmt(m.leadsAssigned)}</td>
                      <td style={{ color: "var(--crm-fg-muted)", fontSize: 12 }}>
                        {m.lastActive ? relativeTime(m.lastActive) : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </PageShell>
    </DashboardLayout>
  );
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
