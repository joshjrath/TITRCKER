import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/Logo";

/** Centered single-column shell shared by /sign-in, /sign-in/two-factor and /setup. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-10 text-text">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <LogoMark size={28} decorative />
          <span className="text-xl font-semibold tracking-tight">Tenth</span>
        </div>
        <section className="rounded-panel border border-line bg-surface p-6 sm:p-8">{children}</section>
      </div>
    </main>
  );
}
