/**
 * Chart series built only from recorded money (no forecasts).
 *
 * Cumulative accrued tithe is a step series of obligation events in the bucket shown (or all buckets
 * for all time). Opening obligations dated before the period start in the same bucket form the
 * starting value. The given line is the cumulative allocation to the bucket by payment date (or all
 * payments for all time). The monthly breakdown lists every month in the range, including zero months, plus
 * "before" / "after" rows for period amounts dated outside the range, so its totals match the period figures.
 */
import type { Currency } from './constants';
import { maxLocalDate, minLocalDate, monthKeyOf, monthsInRange, yearOf, type LocalDate, type MonthKey } from './dates';
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

/** The three money columns of a monthly breakdown row. */
export interface MonthRowValues {
  /** Income received minus refunds effective on the row's dates. */
  netIncomeMinor: Minor;
  /** Σ obligation events dated on the row's dates: income tithe + refund deltas + openings. */
  titheMinor: Minor;
  /**
   * Given on the row's dates, by payment date: for a year, the allocations to that year's bucket (the same
   * measure as the period's "Given"); for all time, whole payment amounts.
   */
  paidMinor: Minor;
}

/**
 * One row of the monthly breakdown:
 * - `month`: a calendar month inside the range (zero months included).
 * - `before`: amounts that belong to the period but are dated before the range start, e.g. an opening balance
 *   dated before the tracking start, or a payment allocated to this year made earlier. `date` is the range start.
 * - `after`: allocations to this period from payments made after the range end (e.g. paid next January).
 *   `date` is the range end.
 *
 * Every row has a `monthKey` (for `before` / `after` rows, the month of `date`), so tell rows apart by `kind`.
 * `before` and `after` rows appear only when they hold something, so the rows always add up to the period's
 * figures: Σ tithe = accrued, Σ income = net income, Σ given = given.
 */
export type MonthRow = MonthRowValues & { monthKey: MonthKey } & (
    | { kind: 'month' }
    | { kind: 'before' | 'after'; date: LocalDate }
  );

const emptyValues = (): MonthRowValues => ({ netIncomeMinor: ZERO, titheMinor: ZERO, paidMinor: ZERO });

const hasValues = (v: MonthRowValues): boolean => v.netIncomeMinor !== 0 || v.titheMinor !== 0 || v.paidMinor !== 0;

/**
 * Monthly rows for one currency and period. For a year, everything that belongs to that year's bucket counts
 * (incomes received and refunds effective that year, the bucket's obligation events and the allocations to it);
 * amounts dated outside the range go to a `before` / `after` row. For `'all'`, every record of the currency counts
 * and given is whole payments by payment date.
 */
export function monthlyBreakdown(
  snapshot: LedgerSnapshot,
  events: readonly ObligationEvent[],
  currency: Currency,
  range: PeriodRange,
): MonthRow[] {
  const key = range.key;
  const inPeriod = (year: number): boolean => key === 'all' || year === key;
  const months = new Map<MonthKey, MonthRowValues>(monthsInRange(range.start, range.end).map((k) => [k, emptyValues()]));
  const before = emptyValues();
  const after = emptyValues();
  const valuesFor = (d: LocalDate): MonthRowValues => {
    if (d < range.start) return before;
    if (d > range.end) return after;
    const values = months.get(monthKeyOf(d));
    if (!values) throw new RangeError(`No month row for ${d}`);
    return values;
  };

  const incomeCurrency = new Map(snapshot.incomes.map((i) => [i.id, i.currency] as const));
  for (const income of snapshot.incomes) {
    if (income.currency !== currency || !inPeriod(yearOf(income.receivedOn))) continue;
    const values = valuesFor(income.receivedOn);
    values.netIncomeMinor = addMinor(values.netIncomeMinor, income.amountMinor);
  }
  for (const adjustments of adjustmentsByIncome(snapshot).values()) {
    for (const adjustment of adjustments) {
      if (incomeCurrency.get(adjustment.incomeId) !== currency || !inPeriod(yearOf(adjustment.effectiveOn))) continue;
      const values = valuesFor(adjustment.effectiveOn);
      values.netIncomeMinor = addMinor(values.netIncomeMinor, negMinor(adjustment.amountMinor));
    }
  }
  for (const event of events) {
    if (event.currency !== currency || !inPeriod(event.bucketYear)) continue;
    const values = valuesFor(event.date);
    values.titheMinor = addMinor(values.titheMinor, event.amountMinor);
  }
  for (const payment of snapshot.payments) {
    if (payment.currency !== currency) continue;
    const given =
      key === 'all'
        ? payment.amountMinor
        : sumMinor(payment.allocations.filter((a) => a.bucketYear === key).map((a) => a.amountMinor));
    if (given === 0) continue;
    const values = valuesFor(payment.paidOn);
    values.paidMinor = addMinor(values.paidMinor, given);
  }

  return [
    ...(hasValues(before) ? [{ kind: 'before' as const, monthKey: monthKeyOf(range.start), date: range.start, ...before }] : []),
    ...[...months].map(([monthKey, values]) => ({ kind: 'month' as const, monthKey, ...values })),
    ...(hasValues(after) ? [{ kind: 'after' as const, monthKey: monthKeyOf(range.end), date: range.end, ...after }] : []),
  ];
}
