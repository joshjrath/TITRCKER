"use client";

import type { ComponentProps } from "react";
import { cn } from "./cn";
import { controlBase, controlSize } from "./control-styles";
import { useFieldControl } from "./Field";

export interface DateInputProps extends Omit<ComponentProps<"input">, "type" | "size"> {
  size?: keyof typeof controlSize;
  invalid?: boolean;
}

/** Native date input (value "YYYY-MM-DD"); the picker follows color-scheme: dark. */
export function DateInput({ size = "md", invalid, className, ...rest }: DateInputProps) {
  const wiring = useFieldControl({ ...rest, invalid });
  return (
    <input
      type="date"
      {...rest}
      {...wiring}
      className={cn(controlBase, controlSize[size], "tabular min-w-[10.5rem] pr-2", className)}
    />
  );
}
