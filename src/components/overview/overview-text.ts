import {
  daysBetween,
  formatMoney,
  periodRangeForYear,
  yearOf,
  type BucketPosition,
  type Currency,
  type LocalDate,
  type PeriodKey,
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
    // With nothing allocated, the surplus comes from refunds alone (accrued below zero), not from payments.
    if (bucket.allocatedMinor > 0) {
      notes.given = `${formatMoney(bucket.overCoveredMinor, c)} beyond this period's tithe (after refunds) counts as credit`;
    } else {
      const credit = `Refunds brought this period below zero — ${formatMoney(bucket.overCoveredMinor, c)} counts as credit`;
      notes.accrued = notes.accrued ? `${notes.accrued} · ${credit}` : credit;
    }
  }
  return notes;
}

/**
 * Sublabels for combined period figures (both currencies active): the entry count across both currencies, and each
 * currency's refunds, opening balance and credit notes, kept in its own currency.
 */
export function combinedPeriodStatNotes(
  summaries: Record<Currency, PeriodSummary>,
  buckets: Record<Currency, BucketPosition | null>,
): PeriodStatNotes {
  const cad = periodStatNotes(summaries.CAD, buckets.CAD ?? undefined);
  const usd = periodStatNotes(summaries.USD, buckets.USD ?? undefined);
  const refunds = [summaries.CAD, summaries.USD].filter((s) => s.refundedMinor > 0).map((s) => formatMoney(s.refundedMinor, s.currency));
  const incomeParts = [entries(summaries.CAD.entryCount + summaries.USD.entryCount)];
  if (refunds.length > 0) incomeParts.push(`after ${refunds.join(" and ")} in refunds`);
  const join = (a?: string, b?: string) => [a, b].filter(Boolean).join(" · ") || undefined;
  const notes: PeriodStatNotes = { income: incomeParts.join(" · ") };
  const accrued = join(cad.accrued, usd.accrued);
  const given = join(cad.given, usd.given);
  if (accrued) notes.accrued = accrued;
  if (given) notes.given = given;
  return notes;
}

/** What the monthly breakdown's Given column counts, so its total reads the same as the period's "Given". */
export function monthlyGivenNote(key: PeriodKey): string {
  return key === "all"
    ? "Given counts every payment, by the date it was made."
    : "Given counts payments allocated to this period, by the date they were made — the same as Given above.";
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
