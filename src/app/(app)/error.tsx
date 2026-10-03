"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { EmptyArc, Button, buttonClasses } from "@/components/ui";

/** Calm error for signed-in pages. Nothing was changed; retry() re-fetches and re-renders the segment. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <div className="flex flex-col items-start gap-6 rounded-panel-lg border border-line bg-surface p-6 md:flex-row md:items-center md:gap-10 md:p-10">
      <EmptyArc className="size-20 shrink-0 md:size-28" />
      <div className="flex max-w-prose flex-col gap-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-xl font-medium text-text outline-none">
          This page couldn&apos;t load
        </h1>
        <p className="text-text-2">
          Something went wrong while loading your records. Nothing was changed. Try again, or go back to the Overview.
        </p>
        {error.digest ? <p className="tabular text-xs text-text-3">Reference: {error.digest}</p> : null}
        <div className="mt-3 flex flex-wrap gap-3">
          <Button onClick={() => retry()}>Try again</Button>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            Go to Overview
          </Link>
        </div>
      </div>
    </div>
  );
}
