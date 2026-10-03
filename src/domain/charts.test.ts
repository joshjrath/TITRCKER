import { beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from './dates';
import { cumulativeSeries, monthlyBreakdown } from './charts';
import { deriveObligationEvents } from './obligations';
import { allTimeRange, periodRangeForYear } from './periods';
import type { LedgerSnapshot } from './records';
import { adjustment, d, income, m, opening, payment, resetFixtureSequence, snapshot } from './testFixtures';

const trackingStart = toLocalDate('2026-10-03');

beforeEach(() => resetFixtureSequence());

function ledger(): LedgerSnapshot {
  return snapshot({
    openings: [opening({ amount: '50.00', on: '2026-05-01' })],
    incomes: [
      income({ amount: '1,000.00', on: '2026-10-05', id: 'inc-1' }),
      income({ amount: '500.00', on: '2026-10-05', id: 'inc-2' }),
      income({ amount: '200.00', on: '2026-11-10', id: 'inc-3' }),
      income({ amount: '100.00', on: '2027-01-04', id: 'inc-4' }),
    ],
    adjustments: [adjustment({ incomeId: 'inc-2', amount: '100.00', on: '2026-11-12' })],
    payments: [
      payment({ amount: '30.00', on: '2026-10-20', allocations: [[2026, '30.00']] }),
      payment({ amount: '40.00', on: '2027-01-10', allocations: [[2026, '25.00'], [2027, '10.00']] }),
    ],
  });
}

describe('cumulativeSeries', () => {
  it('steps through the current period, starting from openings dated before the range', () => {
    const snap = ledger();
    const events = deriveObligationEvents(snap);
    const range = periodRangeForYear(2026, trackingStart);
    const series = cumulativeSeries(snap, events, 'CAD', range, d('2026-11-20'), 2026);
    expect(series.startValueMinor).toBe(m('50.00'));
    expect(series.accrued).toEqual([
      { date: '2026-10-03', valueMinor: m('50.00') },
      { date: '2026-10-05', valueMinor: m('200.00') },
      { date: '2026-11-10', valueMinor: m('220.00') },
      { date: '2026-11-12', valueMinor: m('210.00') },
      { date: '2026-11-20', valueMinor: m('210.00') },
    ]);
    expect(series.endValueMinor).toBe(m('210.00'));
    expect(series.given).toEqual([
      { date: '2026-10-03', valueMinor: 0 },
      { date: '2026-10-20', valueMinor: m('30.00') },
      { date: '2026-11-20', valueMinor: m('30.00') },
    ]);
    expect(series.maxMinor).toBe(m('220.00'));
    // the 2027-01-10 allocation to 2026 is dated after the series end
    expect(series.givenAfterRangeMinor).toBe(m('25.00'));
  });

  it('ends a past period on Dec 31 and reports later allocations separately', () => {
    const snap = ledger();
    const events = deriveObligationEvents(snap);
    const series = cumulativeSeries(snap, events, 'CAD', periodRangeForYear(2026, trackingStart), d('2027-02-01'), 2026);
    expect(series.accrued.at(-1)).toEqual({ date: '2026-12-31', valueMinor: m('210.00') });
    expect(series.given.at(-1)).toEqual({ date: '2026-12-31', valueMinor: m('30.00') });
    expect(series.givenAfterRangeMinor).toBe(m('25.00'));
  });

  it('shows only the selected bucket', () => {
    const snap = ledger();
    const events = deriveObligationEvents(snap);
    const series = cumulativeSeries(snap, events, 'CAD', periodRangeForYear(2027, trackingStart), d('2027-02-01'), 2027);
    expect(series.startValueMinor).toBe(0);
    expect(series.accrued).toEqual([
      { date: '2027-01-01', valueMinor: 0 },
      { date: '2027-01-04', valueMinor: m('10.00') },
      { date: '2027-02-01', valueMinor: m('10.00') },
    ]);
    expect(series.given.at(-1)?.valueMinor).toBe(m('10.00'));
  });

  it('renders a future period as a single flat point', () => {
    const snap = ledger();
    const events = deriveObligationEvents(snap);
    const series = cumulativeSeries(snap, events, 'CAD', periodRangeForYear(2028, trackingStart), d('2027-02-01'), 2028);
    expect(series.accrued).toEqual([{ date: '2028-01-01', valueMinor: 0 }]);
    expect(series.maxMinor).toBe(0);
  });

  it('covers every bucket and every payment for all time', () => {
    const snap = ledger();
    const events = deriveObligationEvents(snap);
    const range = allTimeRange(trackingStart, d('2027-02-01'), snap);
    const series = cumulativeSeries(snap, events, 'CAD', range, d('2027-02-01'), 'all');
    // First point is always (range.start, startValue); the opening dated on range.start steps up from it.
    expect(series.accrued.slice(0, 2)).toEqual([
      { date: '2026-05-01', valueMinor: 0 },
      { date: '2026-05-01', valueMinor: m('50.00') },
    ]);
    expect(series.startValueMinor).toBe(0);
    expect(series.endValueMinor).toBe(m('220.00'));
    expect(series.given.at(-1)).toEqual({ date: '2027-02-01', valueMinor: m('70.00') });
  });

  it('ignores the other currency', () => {
    const snap = ledger();
    const series = cumulativeSeries(snap, deriveObligationEvents(snap), 'USD', periodRangeForYear(2026, trackingStart), d('2026-11-20'), 2026);
    expect(series.endValueMinor).toBe(0);
    expect(series.given.every((p) => p.valueMinor === 0)).toBe(true);
  });
});

describe('monthlyBreakdown', () => {
  it('lists every month in the period, with the opening dated before the range and later payments as their own rows', () => {
    const snap = ledger();
    const rows = monthlyBreakdown(snap, deriveObligationEvents(snap), 'CAD', periodRangeForYear(2026, trackingStart));
    expect(rows).toEqual([
      { kind: 'before', monthKey: '2026-10', date: '2026-10-03', netIncomeMinor: 0, titheMinor: m('50.00'), paidMinor: 0 },
      { kind: 'month', monthKey: '2026-10', netIncomeMinor: m('1,500.00'), titheMinor: m('150.00'), paidMinor: m('30.00') },
      { kind: 'month', monthKey: '2026-11', netIncomeMinor: m('100.00'), titheMinor: m('10.00'), paidMinor: 0 },
      { kind: 'month', monthKey: '2026-12', netIncomeMinor: 0, titheMinor: 0, paidMinor: 0 },
      // Paid on Jan 10, 2027: CAD 25.00 of that payment was allocated to 2026.
      { kind: 'after', monthKey: '2026-12', date: '2026-12-31', netIncomeMinor: 0, titheMinor: 0, paidMinor: m('25.00') },
    ]);
  });

  it('adds up to the period figures (accrued, net income, given = allocations to the bucket)', () => {
    const snap = ledger();
    const rows = monthlyBreakdown(snap, deriveObligationEvents(snap), 'CAD', periodRangeForYear(2026, trackingStart));
    const sum = (pick: (r: (typeof rows)[number]) => number): number => rows.reduce((s, r) => s + pick(r), 0);
    expect(sum((r) => r.titheMinor)).toBe(m('210.00'));
    expect(sum((r) => r.netIncomeMinor)).toBe(m('1,600.00'));
    expect(sum((r) => r.paidMinor)).toBe(m('55.00'));
  });

  it('counts only the part of a payment allocated to the year, by payment date', () => {
    const snap = ledger();
    const rows = monthlyBreakdown(snap, deriveObligationEvents(snap), 'CAD', periodRangeForYear(2027, trackingStart));
    expect(rows[0]).toEqual({ kind: 'month', monthKey: '2027-01', netIncomeMinor: m('100.00'), titheMinor: m('10.00'), paidMinor: m('10.00') });
    expect(rows.some((r) => r.kind !== 'month')).toBe(false);
  });

  it('includes openings dated inside the range and has no carry-in row then', () => {
    const snap = ledger();
    const range = periodRangeForYear(2026, d('2026-01-01'));
    const rows = monthlyBreakdown(snap, deriveObligationEvents(snap), 'CAD', range);
    const months = rows.filter((r) => r.kind === 'month');
    expect(months).toHaveLength(12);
    expect(rows[0]?.kind).toBe('month');
    expect(months.find((r) => r.monthKey === '2026-05')?.titheMinor).toBe(m('50.00'));
    expect(months.find((r) => r.monthKey === '2026-01')?.titheMinor).toBe(0);
  });

  it('all time: whole payments by payment date and no before/after rows', () => {
    const snap = ledger();
    const rows = monthlyBreakdown(snap, deriveObligationEvents(snap), 'CAD', allTimeRange(trackingStart, d('2027-01-20'), snap));
    expect(rows.every((r) => r.kind === 'month')).toBe(true);
    expect(rows.reduce((s, r) => s + r.paidMinor, 0)).toBe(m('70.00'));
    expect(rows.find((r) => r.kind === 'month' && r.monthKey === '2026-05')?.titheMinor).toBe(m('50.00'));
  });
});
