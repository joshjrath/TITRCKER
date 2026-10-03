"use client";

import { LogoMark } from "@/components/brand/Logo";
import styles from "./global-error.module.css";

/**
 * Last-resort error page (replaces the root layout). Self-contained styling from a CSS module (no inline
 * <style>, which the CSP blocks); plain links so it works even if client navigation is broken.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en-CA" className={styles.html}>
      <body className={styles.body}>
        <title>Something went wrong · Tenth</title>
        <main className={styles.panel}>
          <span className={styles.mark}>
            <LogoMark size={36} decorative />
          </span>
          <h1 className={styles.title}>Tenth couldn&apos;t load</h1>
          <p className={styles.text}>Something went wrong on our side. Your records were not changed.</p>
          {error.digest ? <p className={styles.ref}>Reference: {error.digest}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => retry()}>
              Try again
            </button>
            {/* A full document load on purpose: the root layout failed, so client navigation cannot be trusted. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className={styles.secondary}>
              Reload Tenth
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
