"use client";

import { useId, type ComponentProps, type ReactNode } from "react";

/**
 * Minimal, accessible building blocks for the auth screens (sign-in, two-factor, setup).
 * Styling uses the design tokens only; the design pass may replace these with the shared UI primitives.
 */

export function FormAlert({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  if (!children) return null;
  const toneClass =
    tone === "error" ? "border-danger/40 bg-danger-wash text-danger" : "border-positive/40 bg-positive-wash text-positive";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-control border px-3 py-2 text-label ${toneClass}`}>
      {children}
    </div>
  );
}

interface TextFieldProps extends Omit<ComponentProps<"input">, "id" | "className"> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

export function TextField({ label, error, hint, ...input }: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="h-11 rounded-control border border-line-input bg-surface-raised px-3 text-body text-text placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-invalid:border-danger"
        {...input}
      />
      {hint ? (
        <p id={hintId} className="text-label text-text-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-label text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ pending, children, pendingLabel }: { pending: boolean; children: ReactNode; pendingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="h-11 rounded-control bg-accent px-4 text-body font-semibold text-accent-ink hover:bg-accent-hover disabled:cursor-progress disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
