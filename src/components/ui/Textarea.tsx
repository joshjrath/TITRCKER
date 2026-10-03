"use client";

import { useState, type ChangeEvent, type ComponentProps } from "react";
import { cn } from "./cn";
import { controlBase } from "./control-styles";
import { useFieldControl } from "./Field";

export interface TextareaProps extends ComponentProps<"textarea"> {
  invalid?: boolean;
  /** Show the live "120/500" counter (requires maxLength). Default true when maxLength is set. */
  showCount?: boolean;
}

/** Multi-line input with a live character count linked through aria-describedby. */
export function Textarea({ invalid, showCount, maxLength, className, onChange, rows = 3, ...rest }: TextareaProps) {
  const initial = String(rest.value ?? rest.defaultValue ?? "");
  const [uncontrolledLength, setUncontrolledLength] = useState(initial.length);
  const length = rest.value !== undefined ? String(rest.value).length : uncontrolledLength;
  const counting = (showCount ?? true) && typeof maxLength === "number";
  const wiring = useFieldControl({ ...rest, invalid });
  const countId = `${wiring.id}-count`;
  const near = counting && length >= maxLength * 0.9;

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setUncontrolledLength(e.target.value.length);
    onChange?.(e);
  }

  return (
    <div className="flex flex-col gap-1">
      <textarea
        rows={rows}
        maxLength={maxLength}
        {...rest}
        {...wiring}
        aria-describedby={counting ? [wiring["aria-describedby"], countId].filter(Boolean).join(" ") : wiring["aria-describedby"]}
        onChange={handleChange}
        className={cn(controlBase, "min-h-[5.5rem] resize-y px-3 py-2.5 text-[0.9375rem] leading-6", className)}
      />
      {counting ? (
        <p id={countId} className={cn("tabular self-end text-xs", near ? "text-copper" : "text-text-3")}>
          {length}/{maxLength}
          <span className="sr-only"> characters used</span>
        </p>
      ) : null}
    </div>
  );
}
