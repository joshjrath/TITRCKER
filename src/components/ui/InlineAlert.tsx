import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "./cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface InlineAlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Optional trailing action (e.g. a small Button or link). */
  action?: ReactNode;
  /**
   * Announce when it appears: "status" (polite) or "alert" (assertive). Leave unset for alerts that are
   * part of the initial page content.
   */
  live?: "status" | "alert";
  className?: string;
  id?: string;
}

const tones: Record<AlertTone, { box: string; icon: string; Icon: typeof Info; label: string }> = {
  info: { box: "bg-accent-wash border-accent/20", icon: "text-accent", Icon: Info, label: "Note" },
  success: { box: "bg-positive-wash border-positive/20", icon: "text-positive", Icon: CircleCheck, label: "Success" },
  warning: { box: "bg-copper-wash border-copper/25", icon: "text-copper", Icon: TriangleAlert, label: "Warning" },
  danger: { box: "bg-danger-wash border-danger/25", icon: "text-danger", Icon: CircleAlert, label: "Error" },
};

/** Inline message with icon + text (never color alone). */
export function InlineAlert({ tone = "info", title, children, action, live, className, id }: InlineAlertProps) {
  const t = tones[tone];
  return (
    <div
      id={id}
      role={live}
      className={cn("flex items-start gap-3 rounded-control border px-4 py-3 text-[0.875rem] leading-5", t.box, className)}
    >
      <t.Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", t.icon)} />
      <div className="min-w-0 flex-1">
        <span className="sr-only">{t.label}: </span>
        {title ? <p className="font-medium text-text">{title}</p> : null}
        {children ? <div className={cn("text-text-2", title ? "mt-0.5" : undefined)}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
