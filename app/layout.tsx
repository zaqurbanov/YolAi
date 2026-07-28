import type { Metadata, Viewport } from "next";
import { Montserrat, Inter, JetBrains_Mono } from "next/font/google";
import { Toast } from "@heroui/react";
import "./globals.css";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";
import { SidebarProvider } from "@/components/SidebarContext";
import { PullToRefresh } from "@/components/PullToRefresh";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { TourProvider } from "@/components/onboarding/TourProvider";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Only consumed by the new "Cyber-Circuit Legal" design (components/design3d)
// for legal-citation chips ("Maddə 61" etc.) — see design-system.md's
// legal-citation type token. next/font still only loads the subset actually
// referenced in CSS, so this costs nothing on pages that never render it.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["500"],
});

export const metadata: Metadata = {
  title: {
    default: "Yol Hərəkəti Qaydaları QA",
    template: "%s | Yol Hərəkəti Qaydaları",
  },
  description: "Yol hərəkəti qaydaları üzrə AI dəstəkli sual-cavab sistemi",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Yol QA",
    statusBarStyle: "black-translucent",
  },
  // Monetag site-ownership verification. Meta-tag route chosen deliberately:
  // their sw.js alternative would replace public/sw.js and break the app's own
  // push-notification reward flow and the PWA install prompt (one service
  // worker per scope, one push subscription per registration).
  other: {
    monetag: "c5de650481e87e7478be1a0596e1e67e",
  },
};

export const viewport: Viewport = {
  themeColor: "#16181d",
  colorScheme: "dark",
};

// Sets the `data-design` attribute AND the `dark` class on <html> from
// localStorage before hydration/paint, so neither the design nor the theme
// ever flashes to the wrong value on load. Kept as a plain inline script (not
// next/script) because it must run synchronously as the browser parses
// <head>, before any CSS/JS asset fetch or hydration — next/script's
// `beforeInteractive` strategy still defers to Next's own script-loading
// machinery and is documented for third-party scripts, not this. A raw
// <script> in the App Router root layout's <head> is rendered verbatim in the
// server HTML and executes immediately when the browser reaches it, ahead of
// <body> paint.
//
// Design is resolved FIRST and theme is resolved AFTER, conditioned on it:
// the "Cyber-Circuit Legal" 3D design is dark-only by product decision (gold
// accent on near-black — a light variant was never designed and was never
// meant to exist), so whenever `data-design` resolves to "3d" the `dark`
// class is forced on regardless of the stored `yol-theme` preference. That
// stored preference is deliberately left untouched in localStorage — it's
// the user's choice for "sadə dizayn" and is honored again the moment they
// switch back (see lib/design/useAppDesign.ts / lib/theme/useDarkMode.ts,
// which enforce this same rule at runtime after mount, not just on load).
//
// Design resolution here reads the SAME `yol-design` cookie every page's
// server component reads via lib/design/getServerDesign.ts (so the
// `data-design` attribute this script sets pre-paint always agrees with
// whichever tree the server actually rendered — no hydration mismatch),
// falling back to localStorage (kept in sync by
// lib/design/useAppDesign.ts's setDesign3D) and finally to '3d': first-time
// visitors with neither a cookie nor localStorage entry get the newer
// "Cyber-Circuit Legal" design by default (product decision, 2026-07-28).
const THEME_AND_DESIGN_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )yol-design=([^;]+)/);var cookieVal=m?decodeURIComponent(m[1]):null;var design=(cookieVal==='simple'||cookieVal==='3d')?cookieVal:(localStorage.getItem('yol-design')==='simple'?'simple':'3d');document.documentElement.setAttribute('data-design',design);var t=localStorage.getItem('yol-theme');var dark=design==='3d'?true:(t!=='light');document.documentElement.classList.toggle('dark',dark);}catch(e){document.documentElement.setAttribute('data-design','3d');document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="az"
      className={`${montserrat.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_AND_DESIGN_INIT_SCRIPT }} />
      </head>
      <body className="h-full flex flex-col overflow-hidden bg-background text-foreground">
        <TourProvider>
          <SidebarProvider>
            <NavBar />
            <div className="flex flex-1 min-h-0">
              <Sidebar />
              <main className="flex flex-1 flex-col min-h-0 overflow-y-auto">
                <PullToRefresh>{children}</PullToRefresh>
              </main>
            </div>
          </SidebarProvider>
        </TourProvider>
        <Toast.Provider placement="top end" />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
