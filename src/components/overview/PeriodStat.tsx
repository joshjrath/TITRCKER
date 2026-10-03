import type { Currency } from "@/domain";
import { AnimatedAmount } from "@/components/motion";
import { keepMoneyTogether } from "@/components/ui";

export interface PeriodStatProps {
  label: string;
  minor: number;
  currency: Currency;
  note?: string;
  noteTone?: "muted" | "positive";
}

/**
 * One supporting figure under the hero (label, animated amount with currency code, quiet note).
 * Phones: a compact label ··· amount row (the amount drops under the label when both don't fit). From 640px: a column
 * (label over figure).
 */
export function PeriodStat({ label, minor, currency, note, noteTone = "muted" }: PeriodStatProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 sm:flex-col sm:flex-nowrap sm:justify-start sm:gap-1">
      <dt className="text-label text-text-2 sm:mb-0.5">{label}</dt>
      <dd className="ml-auto text-right sm:ml-0 sm:text-left">
        <AnimatedAmount minor={minor} currency={currency} size="lg" />
      </dd>
      {note ? <dd className={noteTone === "positive" ? "basis-full text-xs text-positive" : "basis-full text-xs text-text-3"}>{keepMoneyTogether(note)}</dd> : null}
    </div>
  );
}
