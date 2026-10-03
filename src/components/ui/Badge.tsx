import type { ComponentProps } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "accent" | "positive" | "copper" | "danger";

export interface BadgeProps extends ComponentProps<"span"> {
  tone?: BadgeTone;
  /** Small leading dot (decorative; the text carries the meaning). */
  dot?: boolean;
}

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-raised text-text-2 border-line-strong",
  accent: "bg-accent-wash text-accent border-accent/25",
  positive: "bg-positive-wash text-positive border-positive/25",
  copper: "bg-copper-wash text-copper border-copper/25",
  danger: "bg-danger-wash text-danger border-danger/25",
};

/** Compact status label (6px radius chip). */
export function Badge({ tone = "neutral", dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-chip border px-2 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
