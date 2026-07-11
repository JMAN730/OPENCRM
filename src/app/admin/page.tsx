"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageShell } from "@/components/layout/PageShell";
import { trpc } from "@/app/_trpc/client";
import { ShieldAlert } from "lucide-react";

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString();
}

function relativeDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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

const PLAN_LABEL: Record<string, string> = { STARTER: "Starter", PRO: "Pro", BUSINESS: "Business" };

export default function AdminPage() {
  const { data: session, status } = useSession();
  const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean })?.isSuperAdmin === true;

  const [tab, setTab] = useState<"organizations" | "users">("organizations");
  const [userSearch, setUserSearch] = useState("");
  const [orgSearch, setOrgSearch] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const overview = trpc.platform.overview.useQuery(undefined, { enabled: isSuperAdmin });
  const orgs = trpc.platform.organizations.useQuery(
    { search: orgSearch || undefined },
    { enabled: isSuperAdmin },
  );
  const users = trpc.platform.users.useQuery(
    { search: userSearch || undefined },
    { enabled: isSuperAdmin && tab === "users" },
  );
  const orgDetail = trpc.platform.organizationDetail.useQuery(
    { organizationId: selectedOrgId ?? "" },
    { enabled: isSuperAdmin && !!selectedOrgId },
  );

  if (status === "loading") {
    return (
      <DashboardLayout>
        <PageShell title="Admin"><div style={{ color: "var(--crm-fg-faint)" }}>Loading…</div></PageShell>
      </DashboardLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <PageShell title="Admin">
          <div className="crm-card" style={{ padding: 32, display: "flex", gap: 12, alignItems: "center" }}>
            <ShieldAlert size={20} style={{ color: "var(--crm-neg)" }} />
            <div>
              <div style={{ fontWeight: 500 }}>Not authorized</div>
              <div style={{ color: "var(--crm-fg-muted)", fontSize: 13 }}>
                This console is restricted to platform administrators.
              </div>
            </div>
          </div>
        </PageShell>
      </DashboardLayout>
    );
  }

  const o = overview.data;

  return (
    <DashboardLayout>
      <PageShell
        title="Platform Admin"
        subtitle="Cross-organization monitoring — every org, team, and user"
      >
        {/* ── KPI strip ── */}
        <div className="crm-kpi-grid">
          <KpiCard label="Organizations" value={fmt(o?.organizations)} sub={`+${fmt(o?.newOrganizations7d)} · 7d`} />
          <KpiCard label="Users" value={fmt(o?.users)} sub={`+${fmt(o?.newUsers7d)} · 7d`} />
          <KpiCard label="Teams" value={fmt(o?.teams)} />
          <KpiCard label="Leads" value={fmt(o?.leads)} sub="all orgs" />
          <KpiCard label="Calls" value={fmt(o?.calls)} sub="all orgs" />
        </div>

        {/* ── Subscription breakdown ── */}
        {o && (o.subscriptionsByTier.length > 0 || o.subscriptionsByStatus.length > 0) && (
          <div className="crm-card" style={{ padding: 20, display: "flex", flexWrap: "wrap", gap: 24, fontSize: 13 }}>
            <div>
              <div style={{ color: "var(--crm-fg-faint)", marginBottom: 6, fontSize: 12 }}>By plan</div>
              <div style={{ display: "flex", gap: 12 }}>
                {o.subscriptionsByTier.map((t) => (
                  <span key={t.planTier} className="mono">
                    {PLAN_LABEL[t.planTier] ?? t.planTier}: <strong>{fmt(t.count)}</strong>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ color: "var(--crm-fg-faint)", marginBottom: 6, fontSize: 12 }}>By status</div>
              <div style={{ display: "flex", gap: 12 }}>
                {o.subscriptionsByStatus.map((s) => (
                  <span key={s.status} className="mono">{s.status}: <strong>{fmt(s.count)}</strong></span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--crm-border)", marginBottom: 4 }}>
          {(["organizations", "users"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="crm-nav-item"
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                borderBottom: tab === t ? "2px solid var(--crm-accent)" : "2px solid transparent",
                color: tab === t ? "var(--crm-fg)" : "var(--crm-fg-muted)",
                fontWeight: tab === t ? 500 : 400,
                textTransform: "capitalize",
                borderRadius: 0,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Organizations tab ── */}
        {tab === "organizations" && (
          <>
            <input
              className="crm-input"
              placeholder="Search organizations…"
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
              style={{ maxWidth: 320, marginBottom: 12 }}
            />
            <div className="crm-card flush">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Users</th>
                    <th>Teams</th>
                    <th>Leads</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(orgs.data ?? []).map((org) => (
                    <tr
                      key={org.id}
                      onClick={() => setSelectedOrgId(org.id === selectedOrgId ? null : org.id)}
                      style={{ cursor: "pointer", background: org.id === selectedOrgId ? "var(--crm-surface-2)" : undefined }}
                    >
                      <td style={{ fontWeight: 500 }}>{org.name}</td>
                      <td>{org.planTier ? (PLAN_LABEL[org.planTier] ?? org.planTier) : "—"}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{org.subscriptionStatus ?? "—"}</td>
                      <td className="mono">{fmt(org.userCount)}</td>
                      <td className="mono">{fmt(org.teamCount)}</td>
                      <td className="mono">{fmt(org.leadCount)}</td>
                      <td style={{ color: "var(--crm-fg-muted)", fontSize: 12 }}>{relativeDate(org.createdAt)}</td>
                    </tr>
                  ))}
                  {orgs.data && orgs.data.length === 0 && (
                    <tr><td colSpan={7} style={{ color: "var(--crm-fg-faint)", textAlign: "center", padding: 24 }}>No organizations</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Drill-in detail */}
            {selectedOrgId && orgDetail.data && (
              <div className="crm-card" style={{ padding: 24, marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>{orgDetail.data.name}</h3>
                  <button className="crm-btn ghost" style={{ fontSize: 12 }} onClick={() => setSelectedOrgId(null)}>Close</button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--crm-fg-faint)", marginBottom: 8 }}>Teams ({orgDetail.data.teams.length})</div>
                    {orgDetail.data.teams.length === 0 ? (
                      <div style={{ color: "var(--crm-fg-faint)", fontSize: 13 }}>No teams</div>
                    ) : (
                      orgDetail.data.teams.map((t) => (
                        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--crm-border)" }}>
                          <span>{t.name}</span>
                          <span style={{ color: "var(--crm-fg-muted)" }}>
                            {t.leaderName ? `${t.leaderName} · ` : ""}{fmt(t.memberCount)} member{t.memberCount === 1 ? "" : "s"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--crm-fg-faint)", marginBottom: 8 }}>Members ({orgDetail.data.users.length})</div>
                    {orgDetail.data.users.map((u) => (
                      <div key={u.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--crm-border)" }}>
                        <span>{u.name ?? u.email ?? "—"}{u.isSuperAdmin ? " ⚑" : ""}</span>
                        <span className="mono" style={{ color: "var(--crm-fg-muted)", fontSize: 12 }}>{u.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Users tab ── */}
        {tab === "users" && (
          <>
            <input
              className="crm-input"
              placeholder="Search users by name or email…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              style={{ maxWidth: 320, marginBottom: 12 }}
            />
            <div className="crm-card flush">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Organization</th>
                    <th>Team</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {(users.data ?? []).map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 500 }}>
                        {u.name ?? "—"}
                        {u.isSuperAdmin && (
                          <span title="Platform admin" style={{ marginLeft: 6, color: "var(--crm-neg)", fontSize: 11 }}>⚑ admin</span>
                        )}
                      </td>
                      <td style={{ color: "var(--crm-fg-muted)" }}>{u.email ?? "—"}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{u.role}</td>
                      <td>{u.organizationName ?? "—"}</td>
                      <td style={{ color: "var(--crm-fg-muted)", fontSize: 12 }}>{u.teamName ?? "—"}</td>
                      <td style={{ color: "var(--crm-fg-muted)", fontSize: 12 }}>{relativeDate(u.createdAt)}</td>
                    </tr>
                  ))}
                  {users.data && users.data.length === 0 && (
                    <tr><td colSpan={6} style={{ color: "var(--crm-fg-faint)", textAlign: "center", padding: 24 }}>No users</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </PageShell>
    </DashboardLayout>
  );
}
