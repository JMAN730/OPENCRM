import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function DialerPage() {
  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Dialer unavailable</h1>
            <div className="crm-page-sub">Telephony integration is not configured for this workspace.</div>
          </div>
        </div>

        <div className="crm-card" style={{ maxWidth: 680, padding: 32 }}>
          <span className="crm-ribbon">Disabled</span>
          <h2
            style={{
              margin: "18px 0 8px",
              fontSize: 20,
              fontWeight: 650,
              color: "var(--crm-fg)",
            }}
          >
            Calling is paused until Twilio is funded and configured.
          </h2>
          <p style={{ margin: 0, color: "var(--crm-fg-muted)", lineHeight: 1.6, fontSize: 14 }}>
            The interactive dialer has been disabled so calls cannot be started, simulated, or logged from this page.
            Manual call history and outcome tracking remain available from lead records.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
