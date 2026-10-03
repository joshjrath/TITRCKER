import type { Currency } from "@/domain";
import { AnimatedAmount } from "@/components/motion";
import { combinedPartsText, isApproximate, spokenCombinedAmount } from "@/components/fx";
import { keepMoneyTogether } from "@/components/ui";
import type { CombinedAmountVM, FxRateVM } from "@/lib/view-models";

export interface PeriodStatProps {
  label: string;
  minor: number;
  currency: Currency;
  note?: string;
  noteTone?: "muted" | "positive";
  /**
   * Both currencies combined in CAD (display-only): the figure becomes "≈ CAD total" with the separate amounts listed
   * underneath (no ≈ when the USD part is zero, as nothing was converted). `minor`/`currency` are ignored when set.
   */
  combined?: { amount: CombinedAmountVM; rate: FxRateVM | null };
}

/**
 * One supporting figure under the hero (label, animated amount with currency code, quiet note).
 * Phones: a compact label ··· amount row (the amount drops under the label when both don't fit). From 640px: a column
 * (label over figure).
 */
export function PeriodStat({ label, minor, currency, note, noteTone = "muted", combined }: PeriodStatProps) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 sm:flex-col sm:flex-nowrap sm:justify-start sm:gap-1"
      data-combined={combined ? "true" : undefined}
    >
      <dt className="text-label text-text-2 sm:mb-0.5">{label}</dt>
      <dd className="ml-auto text-right sm:ml-0 sm:text-left">
        {combined ? (
          <>
            <span className="sr-only">{spokenCombinedAmount(combined.amount, combined.rate)}</span>
            <span aria-hidden="true" className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
              {isApproximate(combined.amount) ? <span className="text-[1.125rem] font-light text-text-3">≈</span> : null}
              <AnimatedAmount minor={combined.amount.totalCadMinor} currency="CAD" size="lg" />
            </span>
          </>
        ) : (
          <AnimatedAmount minor={minor} currency={currency} size="lg" />
        )}
      </dd>
      {combined ? (
        <dd className="tabular basis-full text-xs text-text-2" data-testid="period-stat-parts" data-sensitive>
          <span className="sr-only">Separately: </span>
          {keepMoneyTogether(combinedPartsText(combined.amount))}
        </dd>
      ) : null}
      {note ? (
        <dd className={noteTone === "positive" ? "basis-full text-xs text-positive" : "basis-full text-xs text-text-3"} data-sensitive>
          {keepMoneyTogether(note)}
        </dd>
      ) : null}
    </div>
  );
}
