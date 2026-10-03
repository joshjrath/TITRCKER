import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_MINOR } from './constants';
import { toLocalDate } from './dates';
import { sumMinor, toMinor, type Minor } from './money';
import { adjustment, income, m } from './testFixtures';
import {
  adjustmentTitheDeltas,
  checkRefundAmount,
  computeTithe,
  netTithe,
  refundEffect,
  refundLimitMessage,
  remainingRefundable,
  sortAdjustments,
  titheBasisFor,
  type AdjustmentInput,
} from './tithe';
import type { RoundingPolicy } from './constants';

describe('computeTithe — policy examples (ARCHITECTURE §3.3)', () => {
  it.each<[string, string]>([
    ['1,750.00', '175.00'],
    ['249.99', '25.00'],
    ['0.05', '0.01'],
    ['0.01', '0.00'],
  ])('CAD %s -> %s', (received, tithe) => {
    expect(computeTithe(m(received))).toBe(m(tithe === '0.00' ? 0 : tithe));
  });

  it('sums per-entry rounded tithes, never 10% of the total', () => {
    const entries = [m('1,750.00'), m('249.99')];
    expect(sumMinor(entries)).toBe(m('1,999.99'));
    expect(sumMinor(entries.map((a) => computeTithe(a)))).toBe(m('200.00'));
    // 10% of the total would also be 200.00 here; a case where they differ:
    const small = [m('0.05'), m('0.05'), m('0.05')];
    expect(sumMinor(small.map((a) => computeTithe(a)))).toBe(3); // 0.03, not round(0.015) = 0.02
  });
});

describe('computeTithe — rounding ties and limits', () => {
  it.each<[number, number]>([
    [5, 1], // 0.05 -> 0.005 -> 0.01
    [4, 0], // 0.04 -> 0.004 -> 0.00
    [15, 2], // 0.15 -> 0.015 -> 0.02
    [25, 3], // 0.25 -> 0.025 -> 0.03
    [105, 11], // 1.05 -> 0.105 -> 0.11
    [24995, 2500], // 249.95 -> 24.995 -> 25.00
    [24994, 2499], // 249.94 -> 24.994 -> 24.99
    [24999, 2500], // 249.99 -> 24.999 -> 25.00
    [1, 0],
    [9, 1],
    [14, 1],
    [MAX_AMOUNT_MINOR, 10_000_000_000], // 999,999,999.99 -> 100,000,000.00
  ])('%i minor -> %i minor', (amount, tithe) => {
    expect(computeTithe(toMinor(amount))).toBe(tithe);
  });

  it('keeps tiny entries (tithe 0.00 is a valid result)', () => {
    expect(computeTithe(toMinor(1))).toBe(0);
    expect(computeTithe(toMinor(0))).toBe(0);
  });

  it('matches the exact rational half-up result for every amount (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_AMOUNT_MINOR }), (amount) => {
        const tithe = computeTithe(toMinor(amount));
        // half up: tithe*10 lies in (amount - 5, amount + 5]
        expect(tithe * 10).toBeGreaterThan(amount - 5);
        expect(tithe * 10).toBeLessThanOrEqual(amount + 5);
      }),
    );
  });

  it('rejects invalid inputs', () => {
    expect(() => computeTithe(toMinor(-1))).toThrow(RangeError);
    expect(() => computeTithe(1.5 as Minor)).toThrow(RangeError);
    expect(() => computeTithe(toMinor(100), 10.5)).toThrow(RangeError);
    expect(() => computeTithe(toMinor(100), -1)).toThrow(RangeError);
    expect(() => computeTithe(toMinor(100), 1000, 'BANKERS' as RoundingPolicy)).toThrow(RangeError);
  });

  it('builds the persisted basis for a new entry', () => {
    expect(titheBasisFor(m('1,750.00'))).toEqual({
      amountMinor: 175000,
      titheRateBps: 1000,
      roundingPolicy: 'HALF_UP_PER_ENTRY_MINOR',
      titheMinor: 17500,
    });
  });
});

describe('refund deltas (ARCHITECTURE §3.4)', () => {
  const entry = income({ amount: '249.99', on: '2026-10-05', id: 'inc-a' });

  it('partial refund: delta = tithe(A - R) - tithe(A)', () => {
    const refund = adjustment({ incomeId: 'inc-a', amount: '100.00', on: '2026-10-10', id: 'r1' });
    // tithe(149.99) = 15.00 ; tithe(249.99) = 25.00
    expect(adjustmentTitheDeltas(entry, [refund]).get('r1')).toBe(-1000);
    expect(netTithe(entry, [refund])).toBe(1500);
  });

  it('multiple refunds telescope to tithe(A - ΣR)', () => {
    const refunds = [
      adjustment({ incomeId: 'inc-a', amount: '0.05', on: '2026-10-06', id: 'r1' }),
      adjustment({ incomeId: 'inc-a', amount: '0.05', on: '2026-10-07', id: 'r2' }),
      adjustment({ incomeId: 'inc-a', amount: '0.05', on: '2026-10-08', id: 'r3' }),
    ];
    const deltas = adjustmentTitheDeltas(entry, refunds);
    // 249.94 -> 24.99 (-0.01), 249.89 -> 24.99 (0), 249.84 -> 24.98 (-0.01)
    expect([...deltas.values()]).toEqual([-1, 0, -1]);
    expect(netTithe(entry, refunds)).toBe(computeTithe(m('249.84')));
  });

  it('a full refund reverses exactly the original tithe', () => {
    const full = adjustment({ incomeId: 'inc-a', amount: '249.99', on: '2026-10-10', id: 'r1' });
    expect(adjustmentTitheDeltas(entry, [full]).get('r1')).toBe(-entry.titheMinor);
    expect(netTithe(entry, [full])).toBe(0);
  });

  it('a full refund made of many pieces also reverses exactly the original tithe', () => {
    const pieces = ['100.00', '0.01', '49.98', '100.00'].map((amount, i) =>
      adjustment({ incomeId: 'inc-a', amount, on: '2026-10-10', id: `r${i}` }),
    );
    const deltas = adjustmentTitheDeltas(entry, pieces);
    expect(sumMinor(deltas.values())).toBe(-2500);
  });

  it('throws when the refund limit is exceeded', () => {
    const tooMuch = [
      adjustment({ incomeId: 'inc-a', amount: '200.00', on: '2026-10-10' }),
      adjustment({ incomeId: 'inc-a', amount: '50.00', on: '2026-10-11' }),
    ];
    expect(() => adjustmentTitheDeltas(entry, tooMuch)).toThrow(/Refund limit exceeded/);
    expect(() => remainingRefundable(entry, tooMuch)).toThrow(RangeError);
  });

  it('rejects a stored tithe that disagrees with the policy', () => {
    expect(() => adjustmentTitheDeltas({ ...entry, titheMinor: toMinor(2499) }, [])).toThrow(RangeError);
  });

  it('checks a proposed refund amount', () => {
    const existing = [adjustment({ incomeId: 'inc-a', amount: '200.00', on: '2026-10-10' })];
    expect(remainingRefundable(entry, existing)).toBe(4999);
    expect(checkRefundAmount(entry, existing, m('49.99'))).toEqual({ ok: true, remainingAfterMinor: 0 });
    expect(checkRefundAmount(entry, existing, m('50.00'))).toEqual({
      ok: false,
      error: 'exceeds_refundable',
      refundableMinor: 4999,
    });
    expect(checkRefundAmount(entry, existing, toMinor(0))).toMatchObject({ ok: false, error: 'non_positive' });
  });

  it('sorts adjustments canonically by effectiveOn, createdAt, id', () => {
    const a = { id: 'b', amountMinor: toMinor(1), effectiveOn: toLocalDate('2026-10-10'), createdAt: '2026-10-10T12:00:00.000Z' };
    const b = { id: 'a', amountMinor: toMinor(1), effectiveOn: toLocalDate('2026-10-10'), createdAt: '2026-10-10T12:00:00.000Z' };
    const c = { id: 'z', amountMinor: toMinor(1), effectiveOn: toLocalDate('2026-10-10'), createdAt: '2026-10-10T08:00:00.000-05:00' };
    const e = { id: 'y', amountMinor: toMinor(1), effectiveOn: toLocalDate('2026-10-09'), createdAt: '2026-12-01T00:00:00.000Z' };
    // c is 13:00Z, so it comes after a/b despite its earlier-looking local string
    expect(sortAdjustments([a, b, c, e]).map((x) => x.id)).toEqual(['y', 'a', 'b', 'z']);
  });

  it('canonical order decides which refund carries the rounding step', () => {
    const base = income({ amount: '0.10', on: '2026-10-05', id: 'inc-b' }); // tithe 0.01
    const first = adjustment({ incomeId: 'inc-b', amount: '0.05', on: '2026-10-06', id: 'x' }); // 0.05 -> 0.01 (0)
    const second = adjustment({ incomeId: 'inc-b', amount: '0.05', on: '2026-10-07', id: 'y' }); // 0.00 -> 0.00 (-0.01)
    const deltas = adjustmentTitheDeltas(base, [second, first]);
    expect(deltas.get('x')).toBe(0);
    expect(deltas.get('y')).toBe(-1);
  });

  it('telescoping property: Σ deltas == tithe(A - ΣR) - tithe(A) and every delta <= 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MAX_AMOUNT_MINOR }),
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), { minLength: 1, maxLength: 8 }),
        fc.boolean(),
        (amount, weights, refundAll) => {
          const A = toMinor(amount);
          const totalRefund = refundAll ? amount : Math.floor(amount / 2);
          // split totalRefund into positive integer parts proportional to weights
          const weightSum = weights.reduce((s, w) => s + w, 0);
          const parts: number[] = [];
          let allocated = 0;
          weights.forEach((w, i) => {
            const part = i === weights.length - 1 ? totalRefund - allocated : Math.floor((totalRefund * w) / weightSum);
            parts.push(part);
            allocated += part;
          });
          const refunds: AdjustmentInput[] = parts
            .filter((p) => p > 0)
            .map((p, i) => ({
              id: `r${i}`,
              amountMinor: toMinor(p),
              effectiveOn: toLocalDate('2026-11-01'),
              createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, i)).toISOString(),
            }));
          const basis = titheBasisFor(A);
          const deltas = [...adjustmentTitheDeltas(basis, refunds).values()];
          const refunded = refunds.reduce((s, r) => s + r.amountMinor, 0);
          expect(sumMinor(deltas)).toBe(computeTithe(toMinor(amount - refunded)) - computeTithe(A));
          for (const delta of deltas) expect(delta).toBeLessThanOrEqual(0);
          if (refundAll) expect(netTithe(basis, refunds)).toBe(0);
        },
      ),
    );
  });
});

describe('refundEffect', () => {
  const basis = titheBasisFor(m('249.99'));

  it('a new refund lowers the tithe to tithe(net after), rounded half up on the remaining amount', () => {
    // 249.99 - 0.05 = 249.94 -> 24.99 (24.994).
    expect(refundEffect(basis, m(0), m('0.05'))).toEqual({
      netAmountAfterMinor: m('249.94'),
      netTitheAfterMinor: m('24.99'),
      titheChangeMinor: -m('0.01'),
    });
    // 249.94 - 0.04 = 249.90 -> 24.99: no change.
    expect(refundEffect(basis, m('0.05'), m('0.04')).titheChangeMinor).toBe(0);
  });

  it('a full refund reverses exactly the remaining tithe; removing a refund adds it back', () => {
    expect(refundEffect(basis, m('0.05'), m('249.94'))).toEqual({ netAmountAfterMinor: 0, netTitheAfterMinor: 0, titheChangeMinor: -m('24.99') });
    expect(refundEffect(basis, m('0.05'), -m('0.05') as Minor)).toEqual({
      netAmountAfterMinor: m('249.99'),
      netTitheAfterMinor: m('25.00'),
      titheChangeMinor: m('0.01'),
    });
  });

  it("uses the entry's own stored rate", () => {
    expect(refundEffect({ ...basis, titheRateBps: 500 }, m(0), m('49.99')).netTitheAfterMinor).toBe(m('10.00'));
  });

  it('matches the telescoping deltas of the stored adjustments (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_AMOUNT_MINOR }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (amount, f1, f2) => {
        const a = toMinor(amount);
        const first = toMinor(Math.floor(amount * f1));
        const second = toMinor(Math.floor((amount - first) * f2));
        const entry = titheBasisFor(a);
        const effect = refundEffect(entry, first, second);
        expect(effect.netTitheAfterMinor).toBe(computeTithe(toMinor(amount - first - second)));
        expect(effect.titheChangeMinor).toBe(computeTithe(toMinor(amount - first - second)) - computeTithe(toMinor(amount - first)));
      }),
      { numRuns: 300 },
    );
  });

  it('refuses refunds beyond the received amount or below zero', () => {
    expect(() => refundEffect(basis, m('200.00'), m('50.00'))).toThrow(RangeError);
    expect(() => refundEffect(basis, m(0), -m('0.01') as Minor)).toThrow(RangeError);
  });
});

describe('refundLimitMessage', () => {
  it('explains the remaining refundable amount, or that nothing is left', () => {
    expect(refundLimitMessage(m('250.00'), 'CAD')).toBe('You can refund at most CAD 250.00 on this entry.');
    expect(refundLimitMessage(toMinor(0), 'USD')).toBe('This entry has already been fully refunded.');
  });
});
