"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { periodRangeForYear, type Currency, type LocalDate } from "@/domain";
import { CurrencyToggle, Select } from "@/components/ui";
import type { PeriodOptionVM } from "@/lib/view-models";
import { overviewHref } from "./overview-text";

/** Human label for a period option: the year's display range ("Oct 3 – Dec 31, 2026") or "All time". */
function optionLabel(option: PeriodOptionVM, trackingStart: LocalDate): string {
  const year = Number(option.key);
  return Number.isInteger(year) && /^\d{4}$/.test(option.key) ? periodRangeForYear(year, trackingStart).label : option.label;
}

export interface PeriodSelectProps {
  options: readonly PeriodOptionVM[];
  /** Selected key ('YYYY' | 'all'). */
  value: string;
  currency: Currency;
  trackingStart: LocalDate;
}

/** Period selector that navigates via the URL (?period=…&currency=…). */
export function PeriodSelect({ options, value, currency, trackingStart }: PeriodSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex flex-col gap-1.5">
      <span className="sr-only">Period</span>
      <Select
        size="md"
        value={value}
        aria-busy={pending || undefined}
        onChange={(e) => {
          const period = e.target.value;
          startTransition(() => router.push(overviewHref({ period, currency }), { scroll: false }));
        }}
        wrapperClassName="md:min-w-[13.5rem]"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {optionLabel(o, trackingStart)}
          </option>
        ))}
      </Select>
    </label>
  );
}

export interface CurrencySwitchProps {
  value: Currency;
  period: string;
  /** Show the toggle only when both currencies have activity; otherwise the currency is plain text. */
  switchable: boolean;
}

/** CAD | USD switch that navigates via the URL, or the single active currency as text. */
export function CurrencySwitch({ value, period, switchable }: CurrencySwitchProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  if (!switchable) {
    return (
      <p className="flex h-11 items-center rounded-control border border-line px-3 text-label font-medium text-text-2">
        <span className="sr-only">Currency: </span>
        {value}
      </p>
    );
  }
  return (
    <CurrencyToggle
      size="md"
      label="Currency shown"
      value={value}
      onChange={(currency) => startTransition(() => router.push(overviewHref({ period, currency }), { scroll: false }))}
    />
  );
}
