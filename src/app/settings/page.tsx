"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSession } from "next-auth/react";
import { useState } from "react";

const NAV = ["Profile", "Workspace", "Members", "Integrations", "Billing", "API", "Audit log"];

export default function SettingsPage() {
  const { data: session } = useSession();
  const [active, setActive] = useState("Profile");

  const userName = session?.user?.name ?? "—";
  const userEmail = session?.user?.email ?? "—";

  const rows: [string, string][] =
    active === "Profile"
      ? [
          ["Name",  userName],
          ["Email", userEmail],
          ["Role",  (session?.user as { role?: string } | undefined)?.role ?? "USER"],
        ]
      : active === "Workspace"
      ? [
          ["Workspace name",    "My workspace"],
          ["Time zone",         Intl.DateTimeFormat().resolvedOptions().timeZone],
          ["Default currency",  "USD ($)"],
          ["Fiscal year start", "January"],
        ]
      : [];

  const desc: Record<string, string> = {
    Profile:      "Your personal information and account preferences.",
    Workspace:    "Workspace defaults and regional settings.",
    Members:      "Manage who has access to this workspace.",
    Integrations: "Connect third-party tools like Twilio, OpenAI, and AWS.",
    Billing:      "Subscription plan and payment details.",
    API:          "API keys and webhook configuration.",
    "Audit log":  "A history of actions taken in this workspace.",
  };

  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Settings</h1>
            <div className="crm-page-sub">Workspace, team, integrations</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV.map((s) => (
              <button
                key={s}
                className="crm-nav-item"
                aria-current={active === s ? "page" : undefined}
                onClick={() => setActive(s)}
                style={{ textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="crm-card" style={{ padding: 24 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "var(--crm-fg)" }}>{active}</h3>
            <p style={{ margin: "0 0 20px", color: "var(--crm-fg-muted)", fontSize: 13 }}>{desc[active]}</p>

            {rows.length > 0 ? (
              <>
                {rows.map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "grid", gridTemplateColumns: "180px 1fr",
                      padding: "12px 0", borderTop: "1px solid var(--crm-border)", fontSize: 13,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ color: "var(--crm-fg-muted)" }}>{k}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: "var(--crm-fg)" }}>{v}</span>
                      <button className="crm-btn" style={{ height: 24, padding: "0 10px", fontSize: 12, marginLeft: "auto" }}>
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--crm-border)" }}>
                  <button className="crm-btn primary" style={{ height: 32, padding: "0 16px" }}>Save changes</button>
                </div>
              </>
            ) : (
              <div style={{ padding: "32px 0", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13, borderTop: "1px solid var(--crm-border)" }}>
                Coming soon
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
