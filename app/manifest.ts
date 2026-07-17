import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yol Hərəkəti Qaydaları QA",
    short_name: "Yol QA",
    description: "Yol hərəkəti qaydaları üzrə AI dəstəkli sual-cavab sistemi",
    start_url: "/chat",
    display: "standalone",
    background_color: "#16181d",
    theme_color: "#16181d",
    icons: [
      {
        src: "/icon/192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon/512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
