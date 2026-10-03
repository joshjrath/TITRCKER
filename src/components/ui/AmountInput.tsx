"use client";

import { useState, type ChangeEvent, type ComponentProps, type ReactNode } from "react";
import { computeTithe, formatMoney, parseAmount, type Currency } from "@/domain";
import { cn } from "./cn";
import { useFieldControl } from "./Field";

export interface AmountInputProps
  extends Omit<ComponentProps<"input">, "type" | "inputMode" | "size" | "prefix" | "value" | "defaultValue"> {
  value?: string;
  defaultValue?: string;
  size?: "md" | "lg";
  invalid?: boolean;
  /** Slot at the right edge for a currency control (e.g. <CurrencyToggle />). */
  currencySlot?: ReactNode;
  /** When set, shows a live "10% tithe" preview line for the typed amount in this currency. */
  tithePreviewCurrency?: Currency;
}

/**
 * Large money entry: text input with inputmode="decimal" (strict parsing happens in the domain's parseAmount),
 * "$" prefix, tabular digits, autocomplete off. The optional preview is linked via aria-describedby
 * (not a live region, so it does not chatter on every keystroke).
 */
export function AmountInput({
  value,
  defaultValue,
  size = "lg",
  invalid,
  currencySlot,
  tithePreviewCurrency,
  className,
  onChange,
  placeholder = "0.00",
  ...rest
}: AmountInputProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const current = value ?? uncontrolled;
  const wiring = useFieldControl({ ...rest, invalid });
  const previewId = `${wiring.id}-preview`;

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setUncontrolled(e.target.value);
    onChange?.(e);
  }

  let preview: ReactNode = null;
  if (tithePreviewCurrency) {
    const parsed = current.trim() ? parseAmount(current) : null;
    preview =
      parsed && parsed.ok ? (
        <>
          10% tithe <span className="text-text-3" aria-hidden="true">→</span>{" "}
          <span className="tabular text-text">{formatMoney(computeTithe(parsed.minor), tithePreviewCurrency)}</span>
        </>
      ) : (
        <>10% of the amount is added to what you have to give.</>
      );
  }

  const lg = size === "lg";
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex items-center gap-2 rounded-control border bg-surface-raised pl-3.5 pr-2 transition-[border-color] duration-[var(--dur-fast)]",
          "has-[input:focus-visible]:border-accent has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent",
          wiring["aria-invalid"] ? "border-danger" : "border-line-input hover:border-[#857c99]",
          lg ? "h-16" : "h-11",
          className,
        )}
      >
        <span aria-hidden="true" className={cn("tabular font-light text-text-2", lg ? "text-[1.75rem]" : "text-[1.0625rem]")}>
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={placeholder}
          {...rest}
          {...wiring}
          aria-describedby={[wiring["aria-describedby"], preview ? previewId : null].filter(Boolean).join(" ") || undefined}
          value={current}
          onChange={handleChange}
          className={cn(
            "tabular h-full w-full min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-text-3",
            lg ? "text-[2rem] font-light tracking-[-0.02em]" : "text-[1.0625rem]",
          )}
        />
        {currencySlot ? <div className="shrink-0">{currencySlot}</div> : null}
      </div>
      {preview ? (
        <p id={previewId} className="text-label text-text-2">
          {preview}
        </p>
      ) : null}
    </div>
  );
}
