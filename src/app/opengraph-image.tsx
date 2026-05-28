import { ImageResponse } from "next/og";

export const alt = "ClientCore sales CRM dashboard preview";
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
          background: "#f5f7fb",
          color: "#111827",
          display: "flex",
          padding: "56px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: "1px solid #d9e0ea",
            borderRadius: "28px",
            background: "#ffffff",
            padding: "48px",
            boxShadow: "0 30px 80px rgba(15, 23, 42, 0.12)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "18px",
                background: "#0f766e",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "30px",
                fontWeight: 800,
              }}
            >
              C
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: "34px", fontWeight: 800 }}>ClientCore</div>
              <div style={{ color: "#64748b", fontSize: "22px" }}>Sales CRM</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "760px" }}>
            <div style={{ fontSize: "68px", lineHeight: 1.02, fontWeight: 900, letterSpacing: "-1px" }}>
              Turn leads into booked conversations.
            </div>
            <div style={{ color: "#475569", fontSize: "28px", lineHeight: 1.35 }}>
              Pipeline, call logging, outreach, tasks, and team follow-up in one focused workspace.
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            {["Lead pipeline", "Call workflow", "Team tasks"].map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  border: "1px solid #cbd5e1",
                  borderRadius: "999px",
                  padding: "12px 18px",
                  color: "#334155",
                  fontSize: "20px",
                  fontWeight: 700,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
