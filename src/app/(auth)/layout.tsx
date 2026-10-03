import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";
import { OrbitalArc } from "@/components/charts";

/** Wide, low sweep around the card: rises from the lower left, crests above the logo and lands at the right. */
const AUTH_ORBIT = { cx: 50, cy: 100, rx: 47, ry: 92, startDeg: 196, endDeg: 338 } as const;

/**
 * Centered, calm shell shared by /sign-in, /sign-in/two-factor and /setup: the Tenth mark and wordmark above one
 * card on the page background, with the empty orbit drawn faintly behind it (decorative only).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="noise relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-4 py-10 text-text">
      {/* One soft lavender glow, full-bleed so it never shows an edge. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(42rem_28rem_at_50%_38%,rgb(184_160_234/0.09),rgb(184_160_234/0.03)_45%,transparent_75%)]"
      />
      <div className="relative w-full max-w-[25rem]">
        <div aria-hidden="true" className="pointer-events-none absolute -inset-x-28 -top-24 bottom-1/3 max-sm:-inset-x-10">
          <OrbitalArc progress={0} variant="empty" geometry={AUTH_ORBIT} compactGeometry={null} />
        </div>
        <div className="relative mb-8 flex justify-center">
          <Logo withWordmark size={30} />
        </div>
        <section className="relative rounded-panel-lg border border-line bg-surface p-6 shadow-overlay sm:p-8">{children}</section>
        <p className="relative mt-6 text-center text-label text-text-3">A private tithe record for one owner.</p>
      </div>
    </main>
  );
}
