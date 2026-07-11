import type { Metadata } from "next";
import { Montserrat, Inter } from "next/font/google";
import { Toast } from "@heroui/react";
import "./globals.css";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";

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

export const metadata: Metadata = {
  title: "Yol Hərəkəti Qaydaları QA",
  description: "Yol hərəkəti qaydaları üzrə AI dəstəkli sual-cavab sistemi",
};

// Sets the `dark` class on <html> from localStorage before hydration/paint, so
// the theme never flashes to the wrong value on load. Kept as a plain inline
// script (not next/script) because it must run synchronously as the browser
// parses <head>, before any CSS/JS asset fetch or hydration — next/script's
// `beforeInteractive` strategy still defers to Next's own script-loading
// machinery and is documented for third-party scripts, not this. A raw
// <script> in the App Router root layout's <head> is rendered verbatim in the
// server HTML and executes immediately when the browser reaches it, ahead of
// <body> paint. Default is dark (this app's brand default per the design
// skill) when no stored preference exists yet.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('yol-theme');var d=t!=='light';document.documentElement.classList.toggle('dark',d);}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="az"
      className={`${montserrat.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-full flex flex-col overflow-hidden bg-background text-foreground">
        <NavBar />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex flex-1 flex-col min-h-0 overflow-y-auto">{children}</main>
        </div>
        <Toast.Provider placement="top end" />
      </body>
    </html>
  );
}
