"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "./cn";

/** Props a form control needs to be wired to its Field. Spread onto the control (or use the context). */
export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  required?: boolean;
}

interface FieldContextValue {
  controlId: string;
  hintId?: string;
  errorId?: string;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function joinIds(...ids: Array<string | undefined | null | false>): string | undefined {
  const s = ids.filter(Boolean).join(" ");
  return s || undefined;
}

/**
 * Used by TextInput, AmountInput, Select, Textarea, DateInput: merges the surrounding Field's id,
 * aria-describedby (error first, then hint, then the control's own ids) and aria-invalid.
 */
export function useFieldControl(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  required?: boolean;
  invalid?: boolean;
  extraDescribedBy?: string;
}) {
  const ctx = useContext(FieldContext);
  const fallbackId = useId();
  const invalid = Boolean(props.invalid || props["aria-invalid"] === true || props["aria-invalid"] === "true" || ctx?.invalid);
  return {
    id: props.id ?? ctx?.controlId ?? fallbackId,
    "aria-describedby": joinIds(ctx?.errorId, ctx?.hintId, props["aria-describedby"], props.extraDescribedBy),
    "aria-invalid": invalid ? (true as const) : undefined,
    required: props.required ?? (ctx?.required || undefined),
  };
}

export interface FieldProps {
  label: ReactNode;
  /** Help text under the control. */
  hint?: ReactNode;
  /** Error message. When set the control gets aria-invalid and the message is linked via aria-describedby. */
  error?: string | null;
  required?: boolean;
  /** Show "(optional)" after the label when not required. */
  showOptional?: boolean;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  /** Content aligned to the right of the label (e.g. a link). */
  labelAside?: ReactNode;
  /** Explicit control id; generated otherwise. */
  id?: string;
  className?: string;
  /** Either a control that reads the Field context, or a render function receiving the wiring props. */
  children: ReactNode | ((control: FieldControlProps) => ReactNode);
}

/** Label + control + hint + error, wired for assistive technology. */
export function Field({
  label,
  hint,
  error,
  required = false,
  showOptional = false,
  hideLabel = false,
  labelAside,
  id,
  className,
  children,
}: FieldProps) {
  const autoId = useId();
  const controlId = id ?? `f${autoId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const ctx: FieldContextValue = { controlId, hintId, errorId, invalid: Boolean(error), required };
  const control: FieldControlProps = {
    id: controlId,
    "aria-describedby": joinIds(errorId, hintId),
    "aria-invalid": error ? true : undefined,
    required: required || undefined,
  };

  return (
    <FieldContext.Provider value={ctx}>
      <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
        <div className={cn("flex items-baseline justify-between gap-3", hideLabel && "sr-only")}>
          <label htmlFor={controlId} className="text-label font-medium text-text-2">
            {label}
            {showOptional && !required ? <span className="font-normal text-text-3"> (optional)</span> : null}
          </label>
          {labelAside ? <div className="text-label">{labelAside}</div> : null}
        </div>
        {typeof children === "function" ? children(control) : children}
        {error ? (
          <p id={errorId} className="flex items-start gap-1.5 text-label text-danger">
            <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
        {hint ? (
          <p id={hintId} className="text-label text-text-3">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
