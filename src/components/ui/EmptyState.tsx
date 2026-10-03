import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Primary action (e.g. an "Add income" Button). */
  action?: ReactNode;
  /** Extra content beside the action, e.g. a live example line. */
  aside?: ReactNode;
  /** Replace the default faint arc illustration; pass null for none. */
  illustration?: ReactNode;
  /** Heading level for the title. */
  headingLevel?: 2 | 3;
  className?: string;
}

/** Faint ring + tenth arc, no motion. Decorative. */
export function EmptyArc({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" fill="none" aria-hidden="true" focusable="false" className={className}>
      <circle cx="60" cy="60" r="48" stroke="var(--accent)" strokeOpacity="0.22" strokeWidth="1.25" />
      <path d="M60 12 A48 48 0 0 1 88.21 21.17" stroke="var(--accent)" strokeOpacity="0.75" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Calm invitation when there is nothing to show yet. Never shows invented data as real. */
export function EmptyState({
  title,
  description,
  action,
  aside,
  illustration,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("flex flex-col items-start gap-5 py-6 sm:flex-row sm:items-center sm:gap-8", className)}>
      {illustration === undefined ? <EmptyArc className="size-20 shrink-0 sm:size-28" /> : illustration}
      <div className="flex min-w-0 max-w-prose flex-col gap-2">
        <Heading className="text-lg font-medium text-text">{title}</Heading>
        {description ? <p className="text-text-2">{description}</p> : null}
        {action || aside ? (
          <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
            {action}
            {aside ? <div className="text-label text-text-2">{aside}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
