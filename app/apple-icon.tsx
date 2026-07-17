import { ImageResponse } from "next/og";

// iOS home-screen icon. Apple ignores transparency and applies its own
// rounded-corner mask, so this is a solid, full-bleed square.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16181d",
        }}
      >
        <span
          style={{
            fontSize: 100,
            fontWeight: 800,
            color: "#7c93f2",
            fontFamily: "sans-serif",
            letterSpacing: -4,
          }}
        >
          Y
        </span>
      </div>
    ),
    { ...size }
  );
}
