/**
 * Chart series built only from recorded money (no forecasts).
 *
 * Cumulative accrued tithe is a step series of obligation events in the bucket shown (or all buckets
 * for all time). Opening obligations dated before the period start in the same bucket form the
 * starting value. The given line is the cumulative allocation to the bucket by payment date (or all
 * payments for all time). The monthly breakdown lists every month in the range, including zero months.
 */
import type { Currency } from './constants';
import { maxLocalDate, minLocalDate, monthKeyOf, monthsInRange, type LocalDate, type MonthKey } from './dates';
import { addMinor, maxMinor, negMinor, sumMinor, ZERO, type Minor } from './money';
import type { ObligationEvent } from './obligations';
import type { PeriodKey, PeriodRange } from './periods';
import { adjustmentsByIncome, type LedgerSnapshot } from './records';

export interface SeriesPoint {
  date: LocalDate;
  valueMinor: Minor;
}

export interface CumulativeSeries {
  currency: Currency;
  range: PeriodRange;
  /**
   * Cumulative accrued tithe: first point is always (range.start, startValue), then one point per
   * event day (an event on range.start gives a second point on that date), last point at series end.
   */
  accrued: SeriesPoint[];
  /** Cumulative amount given (same shape as `accrued`). */
  given: SeriesPoint[];
  /** Largest value of either series (>= 0), for axis scaling. */
  maxMinor: Minor;
  /** Accrued before the range start (e.g. opening obligations dated before the tracking start). */
  startValueMinor: Minor;
  /** Final accrued value. */
  endValueMinor: Minor;
  /** Given before the range start. */
  givenStartValueMinor: Minor;
  /** Final given value within the series. */
  givenEndValueMinor: Minor;
  /** Allocations to this bucket made by payments dated after the series end (e.g. paid next January). */
  givenAfterRangeMinor: Minor;
}

interface DatedAmount {
  date: LocalDate;
  amountMinor: Minor;
}

/**
 * Builds a step series: a starting point `(start, startValue)`, one point per distinct day
 * (cumulative after that day) and a closing point at `end`. Amounts dated before `start` fold into
 * the start value; amounts after `end` are excluded and reported separately.
 *
 * The starting point is never merged with an event day, so amounts dated on `start` itself appear
 * as a second point on the same date (a step up from the start value) instead of overwriting it.
 */
function stepSeries(
  items: readonly DatedAmount[],
  start: LocalDate,
  end: LocalDate,
): { points: SeriesPoint[]; startValue: Minor; endValue: Minor; after: Minor } {
  const sorted = [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const startValue = sumMinor(sorted.filter((i) => i.date < start).map((i) => i.amountMinor));
  const after = sumMinor(sorted.filter((i) => i.date > end).map((i) => i.amountMinor));
  const startPoint: SeriesPoint = { date: start, valueMinor: startValue };
  const dayPoints: SeriesPoint[] = [];
  let running = startValue;
  for (const item of sorted) {
    if (item.date < start || item.date > end) continue;
    running = addMinor(running, item.amountMinor);
    const lastDay = dayPoints[dayPoints.length - 1];
    if (lastDay && lastDay.date === item.date) lastDay.valueMinor = running;
    else dayPoints.push({ date: item.date, valueMinor: running });
  }
  const points = [startPoint, ...dayPoints];
  const last = points[points.length - 1];
  if (!last || last.date < end) points.push({ date: end, valueMinor: running });
  return { points, startValue, endValue: running, after };
}

/**
 * Cumulative accrued and given series for one currency and period.
 *
 * The series runs from `range.start` to `min(today, range.end)` (never before `range.start`), extended
 * to the last accrued event inside the range if one is dated later. For a year, only that bucket's
 * events and allocations count; for `'all'`, every event and every payment of the currency.
 */
export function cumulativeSeries(
  snapshot: LedgerSnapshot,
  events: readonly ObligationEvent[],
  currency: Currency,
  range: PeriodRange,
  today: LocalDate,
  key: PeriodKey,
): CumulativeSeries {
  const inScope = (bucketYear: number): boolean => key === 'all' || bucketYear === key;

  const accruedItems: DatedAmount[] = events
    .filter((e) => e.currency === currency && inScope(e.bucketYear))
    .map((e) => ({ date: e.date, amountMinor: e.amountMinor }));

  const givenItems: DatedAmount[] = snapshot.payments
    .filter((p) => p.currency === currency)
    .flatMap((p) =>
      key === 'all'
        ? [{ date: p.paidOn, amountMinor: p.amountMinor }]
        : p.allocations.filter((a) => a.bucketYear === key).map((a) => ({ date: p.paidOn, amountMinor: a.amountMinor })),
    );

  const clampedToday = maxLocalDate(range.start, minLocalDate(today, range.end));
  const lastEventInRange = accruedItems
    .map((i) => i.date)
    .filter((d) => d >= range.start && d <= range.end)
    .reduce<LocalDate>((latest, d) => maxLocalDate(latest, d), clampedToday);
  const end = lastEventInRange;

  const accrued = stepSeries(accruedItems, range.start, end);
  const given = stepSeries(givenItems, range.start, end);
  const allValues = [...accrued.points, ...given.points].map((p) => p.valueMinor);

  return {
    currency,
    range,
    accrued: accrued.points,
    given: given.points,
    maxMinor: allValues.reduce<Minor>((max, v) => maxMinor(max, v), ZERO),
    startValueMinor: accrued.startValue,
    endValueMinor: accrued.endValue,
    givenStartValueMinor: given.startValue,
    givenEndValueMinor: given.endValue,
    givenAfterRangeMinor: given.after,
  };
}

export interface MonthRow {
  monthKey: MonthKey;
  /** Income received minus refunds effective in the month. */
  netIncomeMinor: Minor;
  /** Σ obligation events dated in the month: income tithe + refund deltas + openings. */
  titheMinor: Minor;
  /** Σ payments dated in the month (whole payment amounts). */
  paidMinor: Minor;
}

/** One row per month in the range (zero months included), for one currency. */
export function monthlyBreakdown(
  snapshot: LedgerSnapshot,
  events: readonly ObligationEvent[],
  currency: Currency,
  range: PeriodRange,
): MonthRow[] {
  const rows = new Map<MonthKey, MonthRow>(
    monthsInRange(range.start, range.end).map((monthKey) => [
      monthKey,
      { monthKey, netIncomeMinor: ZERO, titheMinor: ZERO, paidMinor: ZERO },
    ]),
  );
  const inRange = (d: LocalDate): boolean => d >= range.start && d <= range.end;
  const rowFor = (d: LocalDate): MonthRow | undefined => (inRange(d) ? rows.get(monthKeyOf(d)) : undefined);

  const incomeCurrency = new Map(snapshot.incomes.map((i) => [i.id, i.currency] as const));
  for (const income of snapshot.incomes) {
    const row = income.currency === currency ? rowFor(income.receivedOn) : undefined;
    if (row) row.netIncomeMinor = addMinor(row.netIncomeMinor, income.amountMinor);
  }
  for (const adjustments of adjustmentsByIncome(snapshot).values()) {
    for (const adjustment of adjustments) {
      const row = incomeCurrency.get(adjustment.incomeId) === currency ? rowFor(adjustment.effectiveOn) : undefined;
      if (row) row.netIncomeMinor = addMinor(row.netIncomeMinor, negMinor(adjustment.amountMinor));
    }
  }
  for (const event of events) {
    const row = event.currency === currency ? rowFor(event.date) : undefined;
    if (row) row.titheMinor = addMinor(row.titheMinor, event.amountMinor);
  }
  for (const payment of snapshot.payments) {
    const row = payment.currency === currency ? rowFor(payment.paidOn) : undefined;
    if (row) row.paidMinor = addMinor(row.paidMinor, payment.amountMinor);
  }
  return [...rows.values()];
}
