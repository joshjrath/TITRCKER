"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { controlBase, controlSize } from "./control-styles";
import { useFieldControl } from "./Field";

export interface TextInputProps extends Omit<ComponentProps<"input">, "size"> {
  size?: keyof typeof controlSize;
  /** Mark invalid without a Field (a Field with an error does this automatically). */
  invalid?: boolean;
  /** Decorative adornment inside the left edge (e.g. a search icon). */
  leading?: ReactNode;
  /** Adornment inside the right edge. */
  trailing?: ReactNode;
}

/** Single-line text input. Inside a <Field> it picks up id, aria-describedby, aria-invalid and required. */
export function TextInput({ size = "md", invalid, leading, trailing, className, type = "text", ...rest }: TextInputProps) {
  const wiring = useFieldControl({ ...rest, invalid });
  const input = (
    <input
      type={type}
      {...rest}
      {...wiring}
      className={cn(controlBase, controlSize[size], leading ? "pl-10" : undefined, trailing ? "pr-10" : undefined, className)}
    />
  );
  if (!leading && !trailing) return input;
  return (
    <div className="relative">
      {leading ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-3 [&_svg]:size-4">
          {leading}
        </span>
      ) : null}
      {input}
      {trailing ? <span className="absolute inset-y-0 right-2 flex items-center">{trailing}</span> : null}
    </div>
  );
}
