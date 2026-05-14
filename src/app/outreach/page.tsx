"use client";

import { Clock3, Send, TriangleAlert } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function OutreachPage() {
  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Outreach</h1>
            <div className="crm-page-sub">Sequence automation is not available in this build</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
          <div className="crm-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--crm-surface-2)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--crm-fg-faint)",
                }}
              >
                <Send size={18} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--crm-fg)" }}>
                  Outreach is currently disabled
                </div>
                <div style={{ fontSize: 13, color: "var(--crm-fg-muted)" }}>
                  This route is intentionally present so navigation stays stable, but sequence creation and delivery are not implemented yet.
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                padding: 16,
                borderRadius: "var(--crm-radius-md)",
                border: "1px solid color-mix(in srgb, var(--crm-border) 75%, transparent)",
                background: "color-mix(in srgb, var(--crm-surface-2) 70%, transparent)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--crm-fg)" }}>
                <TriangleAlert size={14} />
                The UI no longer shows fake &quot;New sequence&quot; actions.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--crm-fg)" }}>
                <Clock3 size={14} />
                Enable this page only after sequence storage, delivery providers, analytics, and permission checks are implemented.
              </div>
            </div>
          </div>

          <div className="crm-card" style={{ padding: "24px" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--crm-fg)" }}>
              Before enabling this feature
            </h3>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: 13, color: "var(--crm-fg-muted)" }}>
              <li>Add real sequence storage and step scheduling.</li>
              <li>Integrate an actual delivery provider and webhook handling.</li>
              <li>Track enrollment, send outcomes, replies, and unsubscribes.</li>
              <li>Protect campaign actions with org-scoped permissions and automated tests.</li>
            </ul>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
