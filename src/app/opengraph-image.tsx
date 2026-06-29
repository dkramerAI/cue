import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${BRAND.name} — ${BRAND.tagline}`;

// Branded share card, rendered at build time. Uses system fonts only.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "100px",
          background: "#000000",
          color: "#f5f5f7",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 132,
            height: 132,
            borderRadius: 32,
            background: "#0a84ff",
            marginBottom: 56,
            fontSize: 80,
          }}
        >
          📅
        </div>
        <div style={{ fontSize: 132, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>{BRAND.name}</div>
        <div style={{ fontSize: 46, color: "#aeaeb2", marginTop: 28 }}>{BRAND.tagline}</div>
      </div>
    ),
    { ...size },
  );
}
