"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Plus, Send } from "lucide-react";

const TABS = ["steps", "audience", "analytics", "settings"] as const;
type Tab = typeof TABS[number];
import { useState } from "react";

export default function OutreachPage() {
  const [tab, setTab] = useState<Tab>("steps");

  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Outreach</h1>
            <div className="crm-page-sub">Email and SMS sequences</div>
          </div>
          <div className="crm-page-head-actions">
            <button className="crm-btn primary"><Plus size={13} /> New sequence</button>
          </div>
        </div>

        {/* Stat pills */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "Enrolled",   value: "0", sub: "no sequences yet" },
            { label: "Sent · 7d",  value: "0", sub: "—" },
            { label: "Reply rate", value: "—",  sub: "—" },
            { label: "Meetings",   value: "0",  sub: "—" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="crm-card" style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 12, color: "var(--crm-fg-muted)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--crm-font-mono)", color: "var(--crm-fg)", letterSpacing: "-0.02em" }}>{value}</div>
              <div style={{ fontSize: 12, color: "var(--crm-fg-faint)", marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Sequences table — empty state */}
        <div className="crm-card flush">
          <div className="crm-card-head">
            <h3>Sequences</h3>
            <span className="crm-sub">· 0 total</span>
          </div>
          <div style={{ padding: "64px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--crm-surface-2)", display: "grid", placeItems: "center", color: "var(--crm-fg-faint)" }}>
              <Send size={18} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--crm-fg)" }}>No sequences yet</div>
              <div style={{ fontSize: 13, color: "var(--crm-fg-muted)", marginTop: 4 }}>Create a sequence to start enrolling leads in automated outreach.</div>
            </div>
            <button className="crm-btn primary" style={{ marginTop: 4 }}>
              <Plus size={13} /> New sequence
            </button>
          </div>
        </div>

        {/* Detail panel placeholder */}
        <div className="crm-card flush">
          <div className="crm-card-head">
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>Sequence detail</h3>
              <span className="crm-sub" style={{ fontSize: 12 }}>Select a sequence above to view steps</span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 4, border: "1px solid var(--crm-border)", borderRadius: "var(--crm-radius-sm)", padding: 2 }}>
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "3px 10px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12,
                    fontFamily: "var(--crm-font-sans)", fontWeight: tab === t ? 500 : 400,
                    background: tab === t ? "var(--crm-surface)" : "transparent",
                    color: tab === t ? "var(--crm-fg)" : "var(--crm-fg-muted)",
                    boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,.06)" : "none",
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13 }}>
            No sequence selected
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
