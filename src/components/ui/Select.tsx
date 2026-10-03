"use client";

import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { controlBase, controlSize } from "./control-styles";
import { useFieldControl } from "./Field";

export interface SelectProps extends Omit<ComponentProps<"select">, "size"> {
  size?: keyof typeof controlSize;
  invalid?: boolean;
  /** Class for the wrapper (width etc.). */
  wrapperClassName?: string;
}

/** Native select with a styled chevron. Options render in the dark native menu. */
export function Select({ size = "md", invalid, className, wrapperClassName, children, ...rest }: SelectProps) {
  const wiring = useFieldControl({ ...rest, invalid });
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select {...rest} {...wiring} className={cn(controlBase, controlSize[size], "appearance-none pr-10", className)}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-2" />
    </div>
  );
}
