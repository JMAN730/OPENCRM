import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "180px",
          height: "180px",
          borderRadius: "40px",
          background: "linear-gradient(135deg, #7C3AED, #4F46E5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "96px",
          fontWeight: 900,
          color: "#FFFFFF",
          fontFamily: "Arial, sans-serif",
        }}
      >
        C
      </div>
    ),
    size,
  );
}
