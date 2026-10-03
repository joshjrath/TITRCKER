import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export type IconButtonVariant = "ghost" | "secondary" | "primary" | "danger";

export interface IconButtonProps extends Omit<ComponentProps<"button">, "aria-label" | "children"> {
  /** Required: icon-only controls need an accessible name. */
  "aria-label": string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: "sm" | "md";
}

const variants: Record<IconButtonVariant, string> = {
  ghost: "text-text-2 hover:bg-surface-raised hover:text-text",
  secondary: "border border-line-strong bg-surface-raised text-text hover:bg-surface-hover",
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  danger: "text-danger hover:bg-danger-wash",
};

/** Icon-only button. 44px target below md, 36/40px on larger screens. */
export function IconButton({ icon, variant = "ghost", size = "md", className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-control transition-colors duration-[var(--dur-fast)]",
        "disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-[18px]",
        size === "sm" ? "size-11 md:size-9" : "size-11 md:size-10",
        variants[variant],
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
}
