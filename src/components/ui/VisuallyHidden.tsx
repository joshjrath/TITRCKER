import type { ComponentProps } from "react";
import { cn } from "./cn";

export interface VisuallyHiddenProps extends ComponentProps<"span"> {
  /** Become visible when focused (for skip links and similar). */
  focusable?: boolean;
}

/** Content for assistive technology only. */
export function VisuallyHidden({ focusable = false, className, ...rest }: VisuallyHiddenProps) {
  return <span className={cn(focusable ? "sr-only-focusable" : "sr-only", className)} {...rest} />;
}
