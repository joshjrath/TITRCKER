import type { Currency } from "@/domain";
import { AnimatedAmount } from "@/components/motion";

export interface PeriodStatProps {
  label: string;
  minor: number;
  currency: Currency;
  note?: string;
  noteTone?: "muted" | "positive";
}

/**
 * One supporting figure under the hero (label, animated amount with currency code, quiet note).
 * Phones: a compact label ··· amount row. From 640px: a column (label over figure).
 */
export function PeriodStat({ label, minor, currency, note, noteTone = "muted" }: PeriodStatProps) {
  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 sm:flex sm:flex-col sm:gap-1">
      <dt className="text-label text-text-2 sm:mb-0.5">{label}</dt>
      <dd className="text-right sm:text-left">
        <AnimatedAmount minor={minor} currency={currency} size="lg" />
      </dd>
      {note ? <dd className={noteTone === "positive" ? "col-span-2 text-xs text-positive" : "col-span-2 text-xs text-text-3"}>{note}</dd> : null}
    </div>
  );
}
