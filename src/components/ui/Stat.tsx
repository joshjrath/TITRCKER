import type { ReactNode } from "react";
import type { Currency } from "@/domain";
import { Amount, type AmountSize, type AmountTone } from "./Amount";
import { cn } from "./cn";

export interface StatProps {
  label: ReactNode;
  minor: number;
  currency: Currency;
  size?: AmountSize;
  tone?: AmountTone;
  /** Quiet note under the figure (e.g. "12 entries", "Includes CAD 40.00 carried over"). */
  sublabel?: ReactNode;
  className?: string;
}

/** Label + Amount + optional sublabel. Group several in <StatRow>, separated by hairlines rather than boxes. */
export function Stat({ label, minor, currency, size = "lg", tone, sublabel, className }: StatProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <p className="text-label text-text-2">{label}</p>
      <Amount minor={minor} currency={currency} size={size} tone={tone} />
      {sublabel ? <p className="text-xs text-text-3">{sublabel}</p> : null}
    </div>
  );
}

/** Row of stats divided by hairlines; wraps to a stacked list on narrow screens. */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0",
        "max-sm:divide-y max-sm:divide-line max-sm:*:pt-4 max-sm:[&>*:first-child]:pt-0",
        "sm:divide-x sm:divide-line sm:*:px-6 sm:[&>*:first-child]:pl-0 sm:[&>*:last-child]:pr-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
