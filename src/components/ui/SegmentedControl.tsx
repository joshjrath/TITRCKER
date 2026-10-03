"use client";

import { useId, type ReactNode } from "react";
import { cn } from "./cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible label when `label` is not plain text. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  /** Group label (accessible name of the radiogroup). */
  label: string;
  hideLabel?: boolean;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Radio group name (generated when omitted). Set it to submit with a native form. */
  name?: string;
  size?: "sm" | "md";
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Single-choice segmented control built from native radio inputs: arrow keys move the selection,
 * Tab enters/leaves the group, and the selected segment is shown by a raised shape plus weight, not color alone.
 */
export function SegmentedControl<T extends string>({
  label,
  hideLabel = true,
  options,
  value,
  onChange,
  name,
  size = "md",
  fullWidth = false,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const autoId = useId();
  const groupName = name ?? `seg${autoId}`;
  const labelId = `${groupName}-label`;
  return (
    <div className={cn("inline-flex flex-col gap-1.5", fullWidth ? "w-full" : "w-fit max-w-full", className)}>
      <span id={labelId} className={hideLabel ? "sr-only" : "text-label font-medium text-text-2"}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-disabled={disabled || undefined}
        className={cn(
          "inline-flex rounded-control border border-line-strong bg-surface p-[3px]",
          fullWidth && "w-full",
        )}
      >
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative flex cursor-pointer select-none items-center justify-center rounded-[7px] font-medium",
                /* Hit area reaches the group's outer edge (3px padding + 1px border), so md is a full 44px target. */
                "before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
                "transition-colors duration-[var(--dur-fast)]",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent",
                "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
                /* Group heights match the other controls: md 44px everywhere; sm 44px on phones, 36px from md up. */
                size === "sm" ? "h-9 min-w-11 px-3 text-label md:h-7" : "h-9 min-w-12 px-3.5 text-label",
                fullWidth && "flex-1",
                checked
                  ? "bg-surface-hover text-text shadow-[inset_0_0_0_1px_var(--line-input)]"
                  : "text-text-2 hover:text-text",
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={o.value}
                checked={checked}
                disabled={disabled || o.disabled}
                aria-label={o.ariaLabel}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
