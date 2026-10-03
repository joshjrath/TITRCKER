import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Amount, cn } from "@/components/ui";
import type { CurrencyHeadlineVM } from "@/lib/view-models";
import { entryCountText, type CurrencyTotals } from "./ledger-view";

export interface FilteredTotalsProps {
  totals: readonly CurrencyTotals[];
  shown: number;
  total: number;
  filtered: boolean;
  className?: string;
}

/**
 * Totals of the rows on screen, per currency. Labelled as this view so they are never mistaken for the
 * all-time balance. A polite status, so filter changes are announced as a count.
 */
export function FilteredTotals({ totals, shown, total, filtered, className }: FilteredTotalsProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <p role="status" className="text-[0.9375rem] font-medium text-text">
        {filtered ? `Showing ${shown} of ${entryCountText(total)}` : `Showing ${entryCountText(shown)}`}
        <span className="font-normal text-text-3"> · {filtered ? "totals for this filtered view" : "totals for all entries"}</span>
      </p>
      {totals.map((t) => (
        <p key={t.currency} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-label text-text-2 sm:gap-x-2">
          {totals.length > 1 ? (
            <span className="basis-full font-medium text-text-3 sm:basis-auto">
              {entryCountText(t.count)} in {t.currency}:
            </span>
          ) : null}
          <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
            <Amount minor={t.grossMinor} currency={t.currency} size="sm" className="text-text" /> received
          </span>
          {t.refundedMinor > 0 ? (
            <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
              <span aria-hidden="true" className="max-sm:hidden">·</span>
              <Amount minor={t.refundedMinor} currency={t.currency} size="sm" /> refunded
            </span>
          ) : null}
          <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
            <span aria-hidden="true" className="max-sm:hidden">·</span>
            <Amount minor={t.titheMinor} currency={t.currency} size="sm" tone="accent" />
            {t.refundedMinor > 0 ? "tithe after refunds" : "tithe"}
          </span>
        </p>
      ))}
    </div>
  );
}

export interface AllTimeBalanceProps {
  headlines: readonly CurrencyHeadlineVM[];
  className?: string;
}

/** The all-time amount still to give per active currency, shown apart from (and unaffected by) the filters. */
export function AllTimeBalance({ headlines, className }: AllTimeBalanceProps) {
  const active = headlines.filter((h) => h.hasActivity);
  if (active.length === 0) return null;
  return (
    <section
      aria-labelledby="ledger-alltime"
      className={cn("flex flex-col gap-3 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6", className)}
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="ledger-alltime" className="text-label font-medium text-text-2">
          All-time still to give <span className="font-normal text-text-3">· not affected by filters</span>
        </h2>
        <ul className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          {active.map((h) => (
            <li key={h.currency} className="flex flex-wrap items-baseline gap-x-2">
              <Amount minor={h.stillToGiveMinor} currency={h.currency} size="lg" />
              {h.creditMinor > 0 ? (
                <span className="inline-flex items-baseline gap-1 text-xs text-positive">
                  plus <Amount minor={h.creditMinor} currency={h.currency} size="xs" tone="positive" /> credit
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <Link
        href="/given"
        className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-control text-label font-medium text-accent hover:underline md:min-h-0"
      >
        Payments and payout <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </section>
  );
}
