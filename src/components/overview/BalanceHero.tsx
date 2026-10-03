import Link from "next/link";
import { formatMoney, type BucketPosition, type PeriodSummary } from "@/domain";
import { AddIncomeButton } from "@/components/app/AddIncomeButton";
import { AnimatedAmount } from "@/components/motion";
import { CombinedBreakdown, spokenCombined } from "@/components/fx";
import { Badge, cn } from "@/components/ui";
import type { CombinedTotalVM, CurrencyHeadlineVM } from "@/lib/view-models";
import { balanceNotes, overviewHref, periodStatNotes } from "./overview-text";
import { PeriodStat } from "./PeriodStat";

export interface BalanceHeroProps {
  headline: CurrencyHeadlineVM;
  /** The other currency's headline when it has activity (shown compactly, never summed). */
  other: CurrencyHeadlineVM | null;
  summary: PeriodSummary;
  /** Bucket of the selected period (year periods), for the refund over-coverage note. */
  periodBucket: BucketPosition | undefined;
  buckets: readonly BucketPosition[];
  currentYear: number;
  /** Selected period key, for the other-currency link. */
  periodKey: string;
  /** Display-only combined total in CAD (shown at the top whenever USD has activity). */
  combined: CombinedTotalVM;
  /** True when the USD ledger has any activity. */
  usdActive: boolean;
}

function OtherCurrencyLine({ other, periodKey }: { other: CurrencyHeadlineVM; periodKey: string }) {
  const c = other.currency;
  const text =
    other.stillToGiveMinor > 0
      ? `${formatMoney(other.stillToGiveMinor, c)} still to give in ${c}`
      : other.creditMinor > 0
        ? `Nothing to give in ${c} · credit ${formatMoney(other.creditMinor, c)}`
        : `Nothing to give in ${c}`;
  return (
    <p className="text-label text-text-2">
      Also: <span className="tabular text-text">{text}</span>{" "}
      <Link href={overviewHref({ period: periodKey, currency: c })} className="text-accent underline-offset-4 hover:underline">
        Show {c}
      </Link>
    </p>
  );
}

/** "Still to give" (all time, selected currency) with its quiet notes, then the selected period's figures. */
export function BalanceHero({
  headline,
  other,
  summary,
  periodBucket,
  buckets,
  currentYear,
  periodKey,
  combined,
  usdActive,
}: BalanceHeroProps) {
  const c = headline.currency;
  const notes = balanceNotes(headline, buckets, currentYear);
  const statNotes = periodStatNotes(summary, periodBucket);
  // With USD activity, the top figure is the combined total in CAD (display-only; ARCHITECTURE §3.10).
  const showTotal = usdActive && combined.status !== "unavailable" && combined.totalCadMinor !== null;
  const heroMinor = showTotal && combined.totalCadMinor !== null ? combined.totalCadMinor : headline.stillToGiveMinor;
  const heroCurrency = showTotal ? "CAD" : c;
  return (
    <div className="flex h-full flex-col">
      {/* Desktop: the hero sits under the orbit's sweep, centred in the space above the period figures. */}
      <div className="desk:flex desk:flex-1 desk:flex-col desk:justify-center desk:pb-10 desk:pt-28">
        <div className="flex items-center gap-2">
          <h2 id="still-to-give" className="text-[0.9375rem] font-medium text-text-2">
            {showTotal ? (
              <>
                Total still to give <span className="text-text-3">· in CAD</span>
              </>
            ) : (
              "Still to give"
            )}
          </h2>
          <Badge tone="accent" title="Tithe rate: 10% of each entry">
            10%<span className="sr-only"> tithe rate</span>
          </Badge>
        </div>
        <p className="mt-3 flex items-baseline gap-2 md:mt-4" data-testid="still-to-give-amount">
          {showTotal && combined.status === "combined" ? (
            <>
              <span aria-hidden="true" className="text-[2rem] font-light text-text-3 md:text-[3rem]">
                ≈
              </span>
              <span className="sr-only">{spokenCombined(combined)}</span>
            </>
          ) : null}
          <AnimatedAmount minor={heroMinor} currency={heroCurrency} size="hero" />
        </p>
        <p className="mt-3 text-label text-text-3">
          {showTotal ? "Everything not yet given, across all periods and both currencies" : "Everything not yet given, across all periods"}
        </p>
        {usdActive ? <CombinedBreakdown combined={combined} className="mt-4" /> : null}

        {notes.length > 0 || (other && !usdActive) ? (
          <ul className="mt-4 flex flex-col gap-1.5">
            {notes.map((n) => (
              <li key={n.key} className={cn("tabular text-label", n.tone === "positive" ? "text-positive" : "text-text-2")}>
                {n.text}
              </li>
            ))}
            {other && !usdActive ? (
              <li>
                <OtherCurrencyLine other={other} periodKey={periodKey} />
              </li>
            ) : null}
          </ul>
        ) : null}

        {/* Phones: the primary action comes right after the amount. */}
        <div className="mt-6 md:hidden">
          <AddIncomeButton size="lg" fullWidth />
        </div>
      </div>

      <section aria-labelledby="period-figures" className="mt-8 border-t border-line pt-5 desk:mt-0">
        <h3 id="period-figures" className="eyebrow mb-4">
          {summary.range.label}
        </h3>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line sm:*:px-5 sm:[&>*:first-child]:pl-0 sm:[&>*:last-child]:pr-0">
          <PeriodStat label="Income received" minor={summary.netIncomeMinor} currency={c} note={statNotes.income} />
          <PeriodStat label="Tithe accrued" minor={summary.accruedMinor} currency={c} note={statNotes.accrued} />
          <PeriodStat label="Given" minor={summary.givenMinor} currency={c} note={statNotes.given} noteTone="positive" />
        </dl>
      </section>
    </div>
  );
}
