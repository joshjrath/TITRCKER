import type { Metadata } from "next";
import Link from "next/link";

import { LogoMark } from "@/components/brand/Logo";
import { buttonClasses } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found" };

/**
 * App-wide 404. Replaces Next.js's built-in not-found page, whose inline <style> tag carries no CSP nonce and is
 * blocked by the strict style-src-elem policy (src/server/security/csp.ts).
 */
export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-4 py-10 text-center text-text">
      <LogoMark size={36} decorative />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-text-2">This page does not exist or is no longer available.</p>
      </div>
      <Link href="/" className={buttonClasses({ variant: "secondary" })}>
        Back to Tenth
      </Link>
    </main>
  );
}
