import { beforeEach, describe, expect, it } from 'vitest';
import { deriveObligationEvents, eventsForCurrency } from './obligations';
import { adjustment, income, opening, resetFixtureSequence, snapshot } from './testFixtures';

beforeEach(() => resetFixtureSequence());

describe('deriveObligationEvents', () => {
  it('emits income tithe, refund deltas and openings in date order', () => {
    const snap = snapshot({
      incomes: [income({ amount: '249.99', on: '2026-10-05', id: 'inc-1' })],
      adjustments: [adjustment({ incomeId: 'inc-1', amount: '100.00', on: '2027-01-10', id: 'adj-1' })],
      openings: [opening({ amount: '300.00', on: '2025-12-31', id: 'open-1' })],
    });
    const events = deriveObligationEvents(snap);
    expect(events.map((e) => [e.source, e.sourceId, e.date, e.bucketYear, e.amountMinor, e.incomeId])).toEqual([
      ['opening', 'open-1', '2025-12-31', 2025, 30000, undefined],
      ['income', 'inc-1', '2026-10-05', 2026, 2500, 'inc-1'],
      ['refund', 'adj-1', '2027-01-10', 2027, -1000, 'inc-1'],
    ]);
  });

  it('computes deltas per income in canonical order regardless of input order', () => {
    const snap = snapshot({
      incomes: [income({ amount: '0.10', on: '2026-10-05', id: 'inc-1' })],
      adjustments: [
        adjustment({ incomeId: 'inc-1', amount: '0.05', on: '2026-10-07', id: 'later' }),
        adjustment({ incomeId: 'inc-1', amount: '0.05', on: '2026-10-06', id: 'earlier' }),
      ],
    });
    const deltas = Object.fromEntries(
      deriveObligationEvents(snap)
        .filter((e) => e.source === 'refund')
        .map((e) => [e.sourceId, e.amountMinor]),
    );
    expect(deltas).toEqual({ earlier: 0, later: -1 });
  });

  it('ignores adjustments of deleted (absent) incomes and keeps currencies', () => {
    const snap = snapshot({
      incomes: [income({ amount: '10.00', on: '2026-10-05', currency: 'USD', id: 'inc-u' })],
      adjustments: [adjustment({ incomeId: 'gone', amount: '1.00', on: '2026-10-06' })],
    });
    const events = deriveObligationEvents(snap);
    expect(events).toHaveLength(1);
    expect(eventsForCurrency(events, 'USD')).toHaveLength(1);
    expect(eventsForCurrency(events, 'CAD')).toHaveLength(0);
  });

  it('throws when refunds exceed the income', () => {
    const snap = snapshot({
      incomes: [income({ amount: '10.00', on: '2026-10-05', id: 'inc-1' })],
      adjustments: [adjustment({ incomeId: 'inc-1', amount: '10.01', on: '2026-10-06' })],
    });
    expect(() => deriveObligationEvents(snap)).toThrow(RangeError);
  });
});
