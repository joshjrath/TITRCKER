import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { connection } from "next/server";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

/*
 * Inter (variable, wght 100–900 + opsz 14–32), self-hosted from @fontsource-variable/inter.
 * Two subsets share one family name and are split by unicode-range exactly like Fontsource does,
 * so only the subset a page actually needs is downloaded. (Font loader options must be literals.)
 * globals.css builds --font-sans as: "Tenth Inter" → var(--font-inter) (its metric-matched Arial fallback) → system. Optical sizing gives large figures the display cut.
 */
const interLatin = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  adjustFontFallback: "Arial",
  declarations: [
    { prop: "font-family", value: "Tenth Inter" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

const interLatinExt = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-ext-opsz-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter-ext",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Tenth Inter" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

export const metadata: Metadata = {
  title: { default: "Tenth", template: "%s · Tenth" },
  description: "A private record of income received and the tenth set aside to give.",
  applicationName: "Tenth",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: "no-referrer",
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#0B0A10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android Chrome: shrink the layout viewport when the keyboard opens, so bottom sheets sit above it.
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Render every route per request: the CSP (src/proxy.ts) uses a per-request nonce, which Next.js can only stamp
  // on scripts of dynamically rendered pages. A prerendered page (including /_not-found) would have all its
  // scripts blocked by the CSP.
  await connection();
  return (
    <html lang="en-CA" className={`${interLatin.variable} ${interLatinExt.variable}`}>
      <body className="min-h-dvh bg-bg text-text antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
