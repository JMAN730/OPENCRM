import { ImageResponse } from "next/og";

export const alt = "ClientCore — AI CRM & Lead Automation";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0B0A1E",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {/* Logo + brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #7C3AED, #4F46E5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              fontWeight: 900,
              color: "#FFFFFF",
            }}
          >
            C
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "32px", fontWeight: 800, color: "#FFFFFF" }}>ClientCore</div>
            <div style={{ fontSize: "18px", color: "#A78BFA" }}>AI CRM & Lead Automation</div>
          </div>
        </div>

        {/* Headline + subtitle */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              fontSize: "72px",
              fontWeight: 900,
              lineHeight: 1.0,
              letterSpacing: "-2px",
              color: "#FFFFFF",
            }}
          >
            Automate Leads.{"\n"}Close More Deals.
          </div>
          <div style={{ fontSize: "26px", color: "#C4B5FD", lineHeight: 1.4, maxWidth: "780px" }}>
            The all-in-one CRM platform to automate outreach, manage clients, and scale faster with AI.
          </div>
        </div>

        {/* Feature pills */}
        <div style={{ display: "flex", gap: "12px" }}>
          {["Lead Management", "AI Automation", "Pipeline Builder", "Smart Follow-ups"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                border: "1px solid rgba(124, 58, 237, 0.5)",
                borderRadius: "999px",
                padding: "10px 20px",
                background: "rgba(124, 58, 237, 0.15)",
                color: "#DDD6FE",
                fontSize: "18px",
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
