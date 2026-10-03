import {
  daysBetween,
  formatMoney,
  periodRangeForYear,
  yearOf,
  type BucketPosition,
  type Currency,
  type LocalDate,
  type PeriodSummary,
} from "@/domain";
import type { PeriodProgressVM } from "@/lib/view-models";
import type { CurrencyHeadlineVM } from "@/lib/view-models";

/** URL of the Overview for a period ('YYYY' | 'all') and currency. */
export function overviewHref({ period, currency }: { period?: string | null; currency?: Currency | null }): string {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (currency) params.set("currency", currency);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

/** The payout review on the Given page, prefilled for one currency. */
export function payoutReviewHref(currency: Currency): string {
  return `/given?${new URLSearchParams({ review: "payout", currency }).toString()}`;
}

export interface BalanceNote {
  key: "carried" | "credit" | "set-aside";
  text: string;
  tone: "muted" | "positive";
}

/**
 * Quiet notes under the "Still to give" figure (selected currency, all time): money carried over from earlier
 * periods, credit (never hidden), and the set-aside line when set aside is in use.
 */
export function balanceNotes(headline: CurrencyHeadlineVM, buckets: readonly BucketPosition[], currentYear: number): BalanceNote[] {
  const { currency } = headline;
  const notes: BalanceNote[] = [];
  if (headline.carriedOverMinor > 0) {
    const years = buckets.filter((b) => b.year < currentYear && b.outstandingMinor > 0).map((b) => b.year);
    const from = years.length === 1 ? String(years[0]) : "earlier years";
    notes.push({ key: "carried", tone: "muted", text: `Includes ${formatMoney(headline.carriedOverMinor, currency)} carried over from ${from}` });
  }
  if (headline.creditMinor > 0) {
    notes.push({ key: "credit", tone: "positive", text: `Credit ${formatMoney(headline.creditMinor, currency)} — applied to future tithe` });
  }
  if (headline.setAsideMinor > 0) {
    notes.push({
      key: "set-aside",
      tone: "muted",
      text: `Set aside ${formatMoney(headline.setAsideMinor, currency)} · still to set aside ${formatMoney(headline.stillToSetAsideMinor, currency)}`,
    });
  }
  return notes;
}

export interface PeriodStatNotes {
  income?: string;
  accrued?: string;
  given?: string;
}

function entries(n: number): string {
  return `${n} ${n === 1 ? "entry" : "entries"}`;
}

/**
 * Sublabels for the selected period's stats. Refunds reduce income received; an opening balance is part of the
 * accrued tithe but never income; and when refunds leave a period's payments above its tithe, that surplus is
 * credit, not extra money given (it is moved to other periods or shown as credit).
 */
export function periodStatNotes(summary: PeriodSummary, bucket: BucketPosition | undefined): PeriodStatNotes {
  const c = summary.currency;
  const notes: PeriodStatNotes = {};
  const incomeParts = [entries(summary.entryCount)];
  if (summary.refundedMinor > 0) incomeParts.push(`after ${formatMoney(summary.refundedMinor, c)} in refunds`);
  notes.income = incomeParts.join(" · ");
  if (summary.openingMinor > 0) notes.accrued = `Includes ${formatMoney(summary.openingMinor, c)} opening balance`;
  if (bucket && bucket.overCoveredMinor > 0) {
    notes.given = `${formatMoney(bucket.overCoveredMinor, c)} beyond this period's tithe (after refunds) counts as credit`;
  }
  return notes;
}

/**
 * The window the year-end block and the orbit describe: the period that ends at the payout target (its year's
 * display range), whatever period the page is showing. Fraction = how far today is from that window's start to the
 * payout date (0..1).
 */
export function payoutWindow(targetDate: LocalDate, trackingStart: LocalDate, today: LocalDate): PeriodProgressVM {
  const range = periodRangeForYear(yearOf(targetDate), trackingStart);
  const total = daysBetween(range.start, targetDate);
  const elapsed = daysBetween(range.start, today);
  const fraction = total <= 0 ? (elapsed >= total ? 1 : 0) : Math.min(1, Math.max(0, elapsed / total));
  return { start: range.start, end: range.end, today, fraction };
}
