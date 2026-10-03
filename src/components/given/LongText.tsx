import { cn } from "@/components/ui";

/** Above this many characters the text is collapsed into a disclosure. */
const COLLAPSE_AT = 90;

export interface LongTextProps {
  /** Visible prefix, e.g. "Note". */
  label: string;
  text: string;
  className?: string;
}

/**
 * Escaped user text with a label. Long text shows one truncated line inside a native <details>
 * disclosure ("Show all"), so the full text is always reachable by keyboard and screen readers.
 */
export function LongText({ label, text, className }: LongTextProps) {
  if (text.length <= COLLAPSE_AT) {
    return (
      <p className={cn("text-label text-text-2 [overflow-wrap:anywhere]", className)}>
        <span className="text-text-3">{label}: </span>
        {text}
      </p>
    );
  }
  return (
    <details className={cn("group text-label text-text-2", className)}>
      <summary className="flex min-h-8 cursor-pointer list-none items-baseline gap-2 rounded-[6px] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 truncate group-open:hidden">
          <span className="text-text-3">{label}: </span>
          {text}
        </span>
        <span className="hidden flex-1 text-text-3 group-open:inline">{label}</span>
        <span className="shrink-0 text-accent">
          <span className="group-open:hidden">Show all</span>
          <span className="hidden group-open:inline">Show less</span>
        </span>
      </summary>
      <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{text}</p>
    </details>
  );
}
