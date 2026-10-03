/**
 * Adversarial tests for chart series (DOMAIN_API "charts.ts"): series shape, the first point,
 * reconciliation with bucket balances, refunds in later years, and monthly breakdown totals.
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from './balances';
import { cumulativeSeries, monthlyBreakdown, type SeriesPoint } from './charts';
import { fromEpochDay, maxLocalDate, minLocalDate, monthsInRange, toEpochDay, type LocalDate } from './dates';
import { deriveObligationEvents } from './obligations';
import { allTimeRange, periodRangeForYear } from './periods';
import type { LedgerSnapshot } from './records';
import { adjustment, d, income, m, opening, payment, resetFixtureSequence, snapshot } from './testFixtures';

beforeEach(() => resetFixtureSequence());

const trackingStart = d('2026-10-03');

describe('first point and same-day collapsing', () => {
  it('the first point is always (range.start, startValue), even with an income on the start day', () => {
    const snap = snapshot({
      openings: [opening({ amount: '50.00', on: '2026-05-01' })],
      incomes: [income({ amount: '1,750.00', on: '2026-10-03' }), income({ amount: '249.99', on: '2026-10-03' })],
    });
    const series = cumulativeSeries(snap, deriveObligationEvents(snap), 'CAD', periodRangeForYear(2026, trackingStart), d('2026-10-10'), 2026);
    expect(series.startValueMinor).toBe(m('50.00'));
    expect(series.accrued).toEqual([
      { date: '2026-10-03', valueMinor: m('50.00') },
      { date: '2026-10-03', valueMinor: m('250.00') },
      { date: '2026-10-10', valueMinor: m('250.00') },
    ]);
  });

  it('a payment on the start day keeps the given line starting at its start value', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-10-03' })],
      payments: [payment({ amount: '40.00', on: '2026-10-03', allocations: [[2026, '40.00']] })],
    });
    const series = cumulativeSeries(snap, deriveObligationEvents(snap), 'CAD', periodRangeForYear(2026, trackingStart), d('2026-10-03'), 2026);
    expect(series.given).toEqual([
      { date: '2026-10-03', valueMinor: 0 },
      { date: '2026-10-03', valueMinor: m('40.00') },
    ]);
    expect(series.accrued.at(-1)).toEqual({ date: '2026-10-03', valueMinor: m('100.00') });
  });

  it('a refund in a later year makes that bucket negative and the axis maximum stays >= 0', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-11-01', id: 'inc-1' })],
      adjustments: [adjustment({ incomeId: 'inc-1', amount: '1,000.00', on: '2027-02-01' })],
    });
    const series = cumulativeSeries(snap, deriveObligationEvents(snap), 'CAD', periodRangeForYear(2027, trackingStart), d('2027-03-01'), 2027);
    expect(series.endValueMinor).toBe(-m('100.00'));
    expect(series.maxMinor).toBe(0);
    const all = cumulativeSeries(snap, deriveObligationEvents(snap), 'CAD', allTimeRange(trackingStart, d('2027-03-01'), snap), d('2027-03-01'), 'all');
    expect(all.endValueMinor).toBe(0);
    expect(all.maxMinor).toBe(m('100.00'));
  });

  it('extends the series to a future-dated event inside the range', () => {
    const snap = snapshot({ incomes: [income({ amount: '100.00', on: '2026-12-20' })] });
    const series = cumulativeSeries(snap, deriveObligationEvents(snap), 'CAD', periodRangeForYear(2026, trackingStart), d('2026-10-10'), 2026);
    expect(series.accrued.at(-1)).toEqual({ date: '2026-12-20', valueMinor: m('10.00') });
    expect(series.given.at(-1)?.date).toBe('2026-12-20');
  });
});

// ---- Random ledgers --------------------------------------------------------------------------

const dateBetween = (min: string, max: string) =>
  fc.integer({ min: toEpochDay(d(min)), max: toEpochDay(d(max)) }).map(fromEpochDay);

const ledgerArb = fc
  .record({
    incomes: fc.array(
      fc.record({
        amount: fc.integer({ min: 1, max: 500_000 }),
        on: dateBetween('2026-10-03', '2028-06-30'),
        currency: fc.constantFrom('CAD' as const, 'USD' as const),
        refunds: fc.array(fc.tuple(fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 0, max: 500 })), { maxLength: 3 }),
      }),
      { maxLength: 8 },
    ),
    openings: fc.array(
      fc.record({ amount: fc.integer({ min: 1, max: 50_000 }), on: dateBetween('2024-01-01', '2028-06-30'), currency: fc.constantFrom('CAD' as const, 'USD' as const) }),
      { maxLength: 3 },
    ),
    payments: fc.array(
      fc.record({
        amount: fc.integer({ min: 1, max: 100_000 }),
        on: dateBetween('2026-10-03', '2028-06-30'),
        currency: fc.constantFrom('CAD' as const, 'USD' as const),
        allocations: fc.array(fc.tuple(fc.integer({ min: 2024, max: 2028 }), fc.integer({ min: 1, max: 1_000_000 })), { maxLength: 3 }),
      }),
      { maxLength: 5 },
    ),
  })
  .map((spec): LedgerSnapshot => {
    const incomes = spec.incomes.map((r, i) => income({ amount: r.amount, on: r.on, currency: r.currency, id: `inc-${i}` }));
    const adjustments = spec.incomes.flatMap((r, i) => {
      let remaining = r.amount;
      return r.refunds.flatMap(([seed, offset], k) => {
        if (remaining === 0) return [];
        const amount = 1 + (seed % remaining);
        remaining -= amount;
        const on = fromEpochDay(Math.min(toEpochDay(r.on) + offset, toEpochDay(d('2028-12-31'))));
        return [adjustment({ incomeId: `inc-${i}`, amount, on, id: `adj-${i}-${k}` })];
      });
    });
    const openings = spec.openings.map((r, i) => opening({ amount: r.amount, on: r.on, currency: r.currency, id: `open-${i}` }));
    const payments = spec.payments.map((r, i) => {
      let remaining = r.amount;
      const used = new Set<number>();
      const allocations: [number, number][] = [];
      for (const [year, seed] of r.allocations) {
        if (remaining === 0 || used.has(year)) continue;
        used.add(year);
        const amount = 1 + (seed % remaining);
        remaining -= amount;
        allocations.push([year, amount]);
      }
      return payment({ amount: r.amount, on: r.on, currency: r.currency, id: `pay-${i}`, allocations });
    });
    return snapshot({ incomes, adjustments, openings, payments });
  });

const currencyArb = fc.constantFrom('CAD' as const, 'USD' as const);
const yearKeyArb = fc.integer({ min: 2024, max: 2029 });

/** Shape every step series must have: starts at range.start, non-decreasing dates, ends at `end`. */
function expectWellFormed(points: SeriesPoint[], start: LocalDate, end: LocalDate, startValue: number): void {
  expect(points[0]).toEqual({ date: start, valueMinor: startValue });
  expect(points.at(-1)?.date).toBe(end);
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    if (!prev || !cur) continue;
    expect(prev.date <= cur.date).toBe(true);
    // Only the opening point may share its date with the next point.
    if (prev.date === cur.date) expect(i).toBe(1);
  }
  for (const p of points) expect(Number.isSafeInteger(p.valueMinor)).toBe(true);
}

describe('cumulativeSeries reconciles with balances (property)', () => {
  it('year series: shape, start value, end value and given split match the bucket', () => {
    fc.assert(
      fc.property(ledgerArb, currencyArb, yearKeyArb, dateBetween('2026-10-03', '2030-03-01'), (snap, currency, year, today) => {
        const events = deriveObligationEvents(snap);
        const range = periodRangeForYear(year, trackingStart);
        const series = cumulativeSeries(snap, events, currency, range, today, year);
        const bucket = computeBalances(snap, trackingStart, events)[currency].buckets.find((b) => b.year === year);

        const inBucket = events.filter((e) => e.currency === currency && e.bucketYear === year);
        const lastInRange = inBucket.map((e) => e.date).filter((dt) => dt >= range.start).reduce((a, b) => maxLocalDate(a, b), range.start);
        const end = maxLocalDate(maxLocalDate(range.start, minLocalDate(today, range.end)), lastInRange);
        const sumBefore = inBucket.filter((e) => e.date < range.start).reduce((s, e) => s + e.amountMinor, 0);
        const sumThrough = inBucket.filter((e) => e.date <= end).reduce((s, e) => s + e.amountMinor, 0);

        expect(series.startValueMinor).toBe(sumBefore);
        expect(series.endValueMinor).toBe(sumThrough);
        expectWellFormed(series.accrued, range.start, end, sumBefore);
        expectWellFormed(series.given, range.start, end, series.givenStartValueMinor);
        if (today >= range.end) expect(series.endValueMinor).toBe(bucket?.accruedMinor ?? 0);
        // Every allocation to the bucket is either before, inside, or after the plotted window.
        expect(series.givenEndValueMinor + series.givenAfterRangeMinor).toBe(bucket?.allocatedMinor ?? 0);
        const values = [...series.accrued, ...series.given].map((p) => p.valueMinor);
        expect(series.maxMinor).toBe(Math.max(0, ...values));
      }),
      { numRuns: 300 },
    );
  });

  it('all-time series: ends at accrued and paid totals', () => {
    fc.assert(
      fc.property(ledgerArb, currencyArb, dateBetween('2028-12-31', '2030-03-01'), (snap, currency, today) => {
        const events = deriveObligationEvents(snap);
        const balance = computeBalances(snap, trackingStart, events)[currency];
        const range = allTimeRange(trackingStart, today, snap);
        const series = cumulativeSeries(snap, events, currency, range, today, 'all');
        expect(series.startValueMinor).toBe(0);
        expect(series.endValueMinor).toBe(balance.accruedMinor);
        expect(series.givenEndValueMinor).toBe(balance.paidMinor);
        expect(series.givenAfterRangeMinor).toBe(0);
        expectWellFormed(series.accrued, range.start, today, 0);
      }),
      { numRuns: 200 },
    );
  });
});

describe('monthlyBreakdown reconciles with balances (property)', () => {
  it('one row per month (plus before/after rows); rows sum to the bucket figures', () => {
    fc.assert(
      fc.property(ledgerArb, currencyArb, yearKeyArb, (snap, currency, year) => {
        const events = deriveObligationEvents(snap);
        const range = periodRangeForYear(year, trackingStart);
        const rows = monthlyBreakdown(snap, events, currency, range);
        const bucket = computeBalances(snap, trackingStart, events)[currency].buckets.find((b) => b.year === year);
        const series = cumulativeSeries(snap, events, currency, range, range.end, year);

        const months = rows.flatMap((r) => (r.kind === 'month' ? [r.monthKey] : []));
        expect(months).toEqual(monthsInRange(range.start, range.end));
        expect(rows.map((r) => r.kind)).toEqual([
          ...(rows[0]?.kind === 'before' ? ['before'] : []),
          ...months.map(() => 'month'),
          ...(rows.at(-1)?.kind === 'after' ? ['after'] : []),
        ]);
        const sum = (pick: (r: (typeof rows)[number]) => number): number => rows.reduce((s, r) => s + pick(r), 0);
        expect(sum((r) => r.titheMinor)).toBe(bucket?.accruedMinor ?? 0);
        expect(sum((r) => r.netIncomeMinor)).toBe(bucket?.netIncomeMinor ?? 0);
        expect(sum((r) => r.paidMinor)).toBe(bucket?.allocatedMinor ?? 0);
        // The carry-in row is exactly the chart's starting value and the given before the range.
        const beforeRow = rows.find((r) => r.kind === 'before');
        expect(beforeRow?.titheMinor ?? 0).toBe(series.startValueMinor);
        expect(beforeRow?.paidMinor ?? 0).toBe(series.givenStartValueMinor);
        expect(rows.find((r) => r.kind === 'after')?.paidMinor ?? 0).toBe(series.givenAfterRangeMinor);
      }),
      { numRuns: 300 },
    );
  });

  it('all-time rows sum to the currency totals', () => {
    fc.assert(
      fc.property(ledgerArb, currencyArb, (snap, currency) => {
        const events = deriveObligationEvents(snap);
        const balance = computeBalances(snap, trackingStart, events)[currency];
        const rows = monthlyBreakdown(snap, events, currency, allTimeRange(trackingStart, d('2029-01-01'), snap));
        expect(rows.reduce((s, r) => s + r.titheMinor, 0)).toBe(balance.accruedMinor);
        expect(rows.reduce((s, r) => s + r.netIncomeMinor, 0)).toBe(balance.netIncomeMinor);
        expect(rows.reduce((s, r) => s + r.paidMinor, 0)).toBe(balance.paidMinor);
      }),
      { numRuns: 200 },
    );
  });
});
