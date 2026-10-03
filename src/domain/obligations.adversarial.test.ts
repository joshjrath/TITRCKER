/**
 * Adversarial tests for obligation events (ARCHITECTURE §3.4–3.5).
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeTithe } from './tithe';
import { deriveObligationEvents } from './obligations';
import { toMinor } from './money';
import { adjustment, income, opening, resetFixtureSequence, snapshot } from './testFixtures';

beforeEach(() => resetFixtureSequence());

const refundedIncomesArb = fc.array(
  fc.record({
    amount: fc.integer({ min: 1, max: 10_000_000 }),
    year: fc.integer({ min: 2026, max: 2028 }),
    refunds: fc.array(fc.record({ share: fc.integer({ min: 1, max: 100 }), yearsLater: fc.integer({ min: 0, max: 2 }) }), { maxLength: 4 }),
  }),
  { maxLength: 6 },
);

describe('deriveObligationEvents', () => {
  it('per income, Σ events = tithe(A − ΣR); refund deltas land in their effective year; order-independent', () => {
    fc.assert(
      fc.property(refundedIncomesArb, (specs) => {
        const incomes = specs.map((s, i) => income({ id: `inc-${i}`, amount: s.amount, on: `${s.year}-11-15` }));
        const adjustments = specs.flatMap((s, i) => {
          let left = s.amount;
          return s.refunds.flatMap((r, k) => {
            const amount = Math.floor((left * r.share) / 100);
            if (amount <= 0) return [];
            left -= amount;
            const on = r.yearsLater === 0 ? `${s.year}-11-15` : `${s.year + r.yearsLater}-01-0${k + 1}`;
            return [adjustment({ id: `adj-${i}-${k}`, incomeId: `inc-${i}`, amount, on })];
          });
        });
        const snap = snapshot({ incomes, adjustments });
        const events = deriveObligationEvents(snap);
        expect(events.length).toBe(incomes.length + adjustments.length); // zero-amount events are kept

        for (const inc of incomes) {
          const own = events.filter((e) => e.incomeId === inc.id);
          const refunded = adjustments.filter((a) => a.incomeId === inc.id).reduce((s, a) => s + a.amountMinor, 0);
          expect(own.reduce((s, e) => s + e.amountMinor, 0)).toBe(computeTithe(toMinor(inc.amountMinor - refunded)));
        }
        for (const event of events) {
          expect(event.bucketYear).toBe(Number(event.date.slice(0, 4)));
          if (event.source === 'refund') expect(event.amountMinor).toBeLessThanOrEqual(0);
          else expect(event.amountMinor).toBeGreaterThanOrEqual(0);
        }
        const reversed = snapshot({ incomes: [...incomes].reverse(), adjustments: [...adjustments].reverse() });
        expect(deriveObligationEvents(reversed)).toEqual(events);
      }),
      { numRuns: 500 },
    );
  });

  it('ignores adjustments of a deleted (absent) income and never counts an opening as income', () => {
    const kept = income({ id: 'kept', amount: '100.00', on: '2026-10-05' });
    const events = deriveObligationEvents(
      snapshot({
        incomes: [kept],
        adjustments: [adjustment({ incomeId: 'deleted', amount: '50.00', on: '2026-10-06' })],
        openings: [opening({ amount: '20.00', on: '2025-12-31' })],
      }),
    );
    expect(events.map((e) => [e.source, e.bucketYear, e.amountMinor])).toEqual([
      ['opening', 2025, 2000],
      ['income', 2026, 1000],
    ]);
    expect(events.find((e) => e.source === 'opening')?.incomeId).toBeUndefined();
  });

  it('throws on a refund total above the received amount and on a stored tithe that breaks the formula', () => {
    const inc = income({ id: 'x', amount: '10.00', on: '2026-10-05' });
    const over = [adjustment({ incomeId: 'x', amount: '6.00', on: '2026-10-06' }), adjustment({ incomeId: 'x', amount: '4.01', on: '2026-10-07' })];
    expect(() => deriveObligationEvents(snapshot({ incomes: [inc], adjustments: over }))).toThrow(RangeError);
    expect(() => deriveObligationEvents(snapshot({ incomes: [{ ...inc, titheMinor: toMinor(99) }] }))).toThrow(RangeError);
  });
});
