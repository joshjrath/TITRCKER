"use client";

import { CURRENCIES, type Currency } from "@/domain";
import { SegmentedControl } from "./SegmentedControl";

export interface CurrencyToggleProps {
  value: Currency;
  onChange: (currency: Currency) => void;
  /** Accessible group label. */
  label?: string;
  hideLabel?: boolean;
  name?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

const OPTIONS = CURRENCIES.map((c) => ({
  value: c,
  label: c,
  ariaLabel: c === "CAD" ? "CAD, Canadian dollars" : "USD, US dollars",
}));

/** CAD | USD radio group (arrow keys switch). */
export function CurrencyToggle({ value, onChange, label = "Currency", hideLabel = true, name, size = "sm", disabled, className }: CurrencyToggleProps) {
  return (
    <SegmentedControl<Currency>
      label={label}
      hideLabel={hideLabel}
      options={OPTIONS}
      value={value}
      onChange={onChange}
      name={name}
      size={size}
      disabled={disabled}
      className={className}
    />
  );
}
