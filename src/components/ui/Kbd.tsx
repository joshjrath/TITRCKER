import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Keyboard key hint. */
export function Kbd({ className, ...rest }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-surface-raised px-1.5 font-sans text-[0.6875rem] font-medium text-text-2",
        className,
      )}
      {...rest}
    />
  );
}
