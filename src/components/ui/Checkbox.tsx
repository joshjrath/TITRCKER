"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import { cn } from "./cn";
import { joinIds } from "./Field";

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type" | "size"> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
}

/** Native checkbox with a custom box; the whole label row is the (≥44px) target. */
export function Checkbox({ label, hint, error, id, className, disabled, ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? `cb${autoId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={inputId}
        className={cn("flex min-h-11 items-start gap-3 py-2.5", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}
      >
        <span className="relative mt-px grid size-5 shrink-0 place-items-center">
          <input
            id={inputId}
            type="checkbox"
            {...rest}
            disabled={disabled}
            aria-describedby={joinIds(errorId, hintId, rest["aria-describedby"])}
            aria-invalid={error ? true : undefined}
            className={cn(
              "peer absolute inset-0 m-0 cursor-[inherit] appearance-none rounded-[6px] border border-line-input bg-surface-raised",
              "transition-colors duration-[var(--dur-fast)] checked:border-accent checked:bg-accent",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              "aria-invalid:border-danger",
            )}
          />
          <Check
            aria-hidden="true"
            strokeWidth={3}
            className="pointer-events-none relative size-3.5 text-accent-ink opacity-0 peer-checked:opacity-100"
          />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="text-[0.9375rem] leading-5 text-text">{label}</span>
          {hint ? (
            <span id={hintId} className="text-label text-text-3">
              {hint}
            </span>
          ) : null}
        </span>
      </label>
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 pl-8 text-label text-danger">
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
