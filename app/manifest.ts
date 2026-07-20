import type { MetadataRoute } from "next";

// Icons are STATIC FILES in public/, not the runtime-generated app/icon.tsx
// route, and that is deliberate. Chrome only fires `beforeinstallprompt` —
// the event that makes InstallAppButton install directly instead of showing
// its manual-instructions modal — when every declared manifest icon actually
// resolves. Pointing at the generated route made installability depend, on
// every single request, on a DB lookup for the admin logo, a multi-megabyte
// remote image fetch, and a satori/WASM render in a worker process. That
// chain broke (the worker crashed, /icon/192 returned 500), and because the
// only symptom was "the install button shows a modal", it was invisible.
//
// A PWA icon is a fixed brand asset that changes approximately never, so
// paying that cost per request bought nothing. Regenerate with sharp from
// public/logo.png if the brand mark changes:
//   sharp('public/logo.png').resize(192, 192, { fit: 'contain', background: '#7c93f2' })
//     .flatten({ background: '#7c93f2' }).png().toFile('public/icon-192.png')
// (and the same at 512). Keep both files well under ~400KB.
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
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Separate asset on purpose: the `any` icons above are transparent, and
      // a transparent maskable icon renders unpredictably once Android crops
      // it to a circle/squircle. This one is the same mark on a solid plate
      // in the app's theme colour, with the logo kept inside the ~80% safe
      // zone so nothing important is clipped by the mask.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
