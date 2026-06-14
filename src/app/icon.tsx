import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          background: "linear-gradient(135deg, #7C3AED, #4F46E5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "18px",
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
