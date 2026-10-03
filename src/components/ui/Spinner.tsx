import { cn } from "./cn";

export interface SpinnerProps {
  /** Size in px. */
  size?: number;
  className?: string;
  /** Accessible label. Omit when the surrounding control already says what is happening (e.g. aria-busy button). */
  label?: string;
}

/** Indeterminate progress. Stops spinning under prefers-reduced-motion; always paired with text or aria-busy. */
export function Spinner({ size = 16, className, label }: SpinnerProps) {
  return (
    <span role={label ? "status" : undefined} className={cn("inline-flex shrink-0", className)}>
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="animate-spin [animation-duration:900ms]"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
