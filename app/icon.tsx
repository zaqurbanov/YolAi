import { ImageResponse } from "next/og";

// PWA install prompts (Android/Chrome) look for 192x192 and 512x512 icons in
// the manifest; generateImageMetadata lets one file serve both sizes instead
// of needing separate icon files. See app/manifest.ts for how these are
// referenced.
export function generateImageMetadata() {
  return [
    { contentType: "image/png", size: { width: 192, height: 192 }, id: "192" },
    { contentType: "image/png", size: { width: 512, height: 512 }, id: "512" },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const iconId = await id;
  const size = iconId === "512" ? 512 : 192;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7c93f2",
        }}
      >
        <span
          style={{
            fontSize: size * 0.56,
            fontWeight: 800,
            color: "#12141a",
            fontFamily: "sans-serif",
            letterSpacing: -4,
          }}
        >
          Y
        </span>
      </div>
    ),
    { width: size, height: size }
  );
}
