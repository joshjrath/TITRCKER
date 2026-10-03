import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium " +
  "transition-[background-color,color,border-color,box-shadow] duration-[var(--dur-fast)] ease-standard " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  /* Disabled filled buttons drop to a neutral raised fill instead of a muddy half-transparent tint. */
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover active:bg-accent-press " +
    "disabled:border disabled:border-line disabled:bg-surface-raised disabled:text-text-3 disabled:opacity-100",
  secondary: "border border-line-strong bg-surface-raised text-text hover:bg-surface-hover hover:border-line-input",
  ghost: "text-text-2 hover:bg-surface-raised hover:text-text",
  danger:
    "bg-danger text-danger-ink hover:bg-danger-hover " +
    "disabled:border disabled:border-line disabled:bg-surface-raised disabled:text-text-3 disabled:opacity-100",
};

/* 44px minimum touch target below md; compact sizes only on pointer-precise layouts. */
const sizes: Record<ButtonSize, string> = {
  sm: "h-11 px-3 text-label md:h-9",
  md: "h-11 px-4 text-[0.9375rem]",
  lg: "h-12 px-5 text-base",
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Button classes, for links that must look like buttons (e.g. `<Link className={buttonClasses()} />`). */
export function buttonClasses({ variant = "primary", size = "md", fullWidth = false, className }: ButtonStyleOptions = {}) {
  return cn(base, variants[variant], sizes[size], fullWidth && "w-full", className);
}

export interface ButtonProps extends ComponentProps<"button">, Omit<ButtonStyleOptions, "className"> {
  /** Shows a spinner, sets aria-busy and ignores clicks while keeping focus on the button. */
  loading?: boolean;
  /** Text announced as the label while loading (defaults to the children). */
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  loadingLabel,
  leadingIcon,
  trailingIcon,
  className,
  children,
  type = "button",
  onClick,
  disabled,
  ...rest
}: ButtonProps) {
  const handleClick = loading
    ? (e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
      }
    : onClick;
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, fullWidth, className })}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      disabled={disabled}
      onClick={handleClick}
      {...rest}
    >
      {loading ? <Spinner size={size === "lg" ? 18 : 16} /> : leadingIcon}
      {loading && loadingLabel ? loadingLabel : children}
      {!loading ? trailingIcon : null}
    </button>
  );
}
