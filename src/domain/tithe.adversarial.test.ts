/**
 * Adversarial tests for per-entry tithe rounding and telescoping refund deltas (ARCHITECTURE §3.3–3.4).
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_MINOR, ROUNDING_POLICY, TITHE_RATE_BPS } from './constants';
import { toLocalDate, type LocalDate } from './dates';
import { sumMinor, toMinor, type Minor } from './money';
import {
  adjustmentTitheDeltas,
  checkRefundAmount,
  computeTithe,
  netTithe,
  remainingRefundable,
  titheBasisFor,
  type AdjustmentInput,
} from './tithe';

/** Reference 10% half-up on integer cents without BigInt: tenths digit decides. */
const referenceTithe = (cents: number): number => Math.floor(cents / 10) + (cents % 10 >= 5 ? 1 : 0);

const amountArb = fc.oneof(
  fc.integer({ min: 1, max: 100 }),
  fc.integer({ min: 1, max: MAX_AMOUNT_MINOR }),
  fc.constant(MAX_AMOUNT_MINOR),
);

const dateArb = fc
  .record({ year: fc.integer({ min: 2026, max: 2029 }), month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }) })
  .map(({ year, month, day }) => toLocalDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`));

/** An income amount and a split of (at most) that amount into positive refunds. */
const refundedIncomeArb = amountArb.chain((amount) =>
  fc
    .array(fc.record({ share: fc.integer({ min: 1, max: 100 }), on: dateArb, sameDay: fc.boolean() }), { maxLength: 6 })
    .map((specs) => {
      let left = amount;
      const adjustments: AdjustmentInput[] = [];
      specs.forEach((spec, i) => {
        const take = Math.max(1, Math.floor((left * spec.share) / 100));
        if (left <= 0 || take > left) return;
        left -= take;
        adjustments.push({
          id: `adj-${String(i).padStart(2, '0')}`,
          amountMinor: toMinor(take),
          effectiveOn: spec.sameDay ? toLocalDate('2026-11-01') : spec.on,
          // identical createdAt on purpose for some entries: the id must break the tie
          createdAt: spec.sameDay ? '2026-11-01T00:00:00.000Z' : `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
        });
      });
      return { amount: toMinor(amount), adjustments };
    }),
);

describe('computeTithe matches the per-entry half-up formula over the whole safe range', () => {
  it('agrees with an independent reference', () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: MAX_AMOUNT_MINOR })), (cents) => {
        expect(computeTithe(toMinor(cents))).toBe(referenceTithe(cents));
      }),
      { numRuns: 3000 },
    );
  });

  it('handles the table in §3.3 and the max amount exactly', () => {
    expect(computeTithe(toMinor(175_000))).toBe(17_500);
    expect(computeTithe(toMinor(24_999))).toBe(2_500);
    expect(computeTithe(toMinor(5))).toBe(1);
    expect(computeTithe(toMinor(4))).toBe(0);
    expect(computeTithe(toMinor(1))).toBe(0);
    expect(computeTithe(toMinor(MAX_AMOUNT_MINOR))).toBe(10_000_000_000);
  });

  it('accrued is the sum of per-entry rounded tithes, never 10% of the total', () => {
    const entries = [5, 5, 5, 5, 5].map((c) => toMinor(c));
    const accrued = sumMinor(entries.map((c) => computeTithe(c)));
    expect(accrued).toBe(5); // 5 × 0.01
    expect(computeTithe(sumMinor(entries))).toBe(3); // what a 10%-of-total implementation would give
  });

  it('rejects malformed rates, policies and amounts', () => {
    expect(() => computeTithe(toMinor(-1))).toThrow(RangeError);
    expect(() => computeTithe(0.5 as Minor)).toThrow(RangeError);
    expect(() => computeTithe(toMinor(100), 10.5)).toThrow(RangeError);
    expect(() => computeTithe(toMinor(100), -1)).toThrow(RangeError);
    expect(() => computeTithe(toMinor(100), TITHE_RATE_BPS, 'BANKERS' as typeof ROUNDING_POLICY)).toThrow(RangeError);
  });
});

describe('telescoping refund deltas', () => {
  it('each delta <= 0, Σ deltas = tithe(A − ΣR) − tithe(A), and netTithe = tithe(A − ΣR)', () => {
    fc.assert(
      fc.property(refundedIncomeArb, ({ amount, adjustments }) => {
        const basis = titheBasisFor(amount);
        const deltas = adjustmentTitheDeltas(basis, adjustments);
        expect(deltas.size).toBe(adjustments.length);
        for (const delta of deltas.values()) expect(delta).toBeLessThanOrEqual(0);
        const refunded = adjustments.reduce((s, a) => s + a.amountMinor, 0);
        const expectedNet = referenceTithe(amount - refunded);
        expect(sumMinor(deltas.values())).toBe(expectedNet - referenceTithe(amount));
        expect(netTithe(basis, adjustments)).toBe(expectedNet);
        expect(remainingRefundable(basis, adjustments)).toBe(amount - refunded);
      }),
      { numRuns: 1000 },
    );
  });

  it('deltas follow canonical order (effectiveOn, createdAt, id), independent of input order', () => {
    fc.assert(
      fc.property(refundedIncomeArb, fc.integer(), ({ amount, adjustments }, seed) => {
        const basis = titheBasisFor(amount);
        const shuffled = [...adjustments].sort((a, b) => ((a.id.charCodeAt(5) * 31 + seed) % 7) - ((b.id.charCodeAt(5) * 31 + seed) % 7));
        expect(adjustmentTitheDeltas(basis, shuffled)).toEqual(adjustmentTitheDeltas(basis, adjustments));
        // reference: walk the canonical order by hand
        const canonical = [...adjustments].sort(
          (a, b) =>
            a.effectiveOn.localeCompare(b.effectiveOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        );
        let left: number = amount;
        let previous = referenceTithe(amount);
        const deltas = adjustmentTitheDeltas(basis, adjustments);
        for (const adjustment of canonical) {
          left -= adjustment.amountMinor;
          const next = referenceTithe(left);
          expect(deltas.get(adjustment.id)).toBe(next - previous);
          previous = next;
        }
      }),
    );
  });

  it('a full refund reverses exactly the original tithe, however it is split', () => {
    fc.assert(
      fc.property(amountArb, fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 8 }), (amount, weights) => {
        const total = weights.reduce((s, w) => s + w, 0);
        const parts = weights.map((w) => Math.floor((amount * w) / total)).filter((p) => p > 0);
        const allocated = parts.reduce((s, p) => s + p, 0);
        parts.push(amount - allocated);
        const adjustments = parts
          .filter((p) => p > 0)
          .map((p, i) => ({
            id: `a${String(i).padStart(2, '0')}`,
            amountMinor: toMinor(p),
            effectiveOn: toLocalDate('2027-03-01'),
            createdAt: `2027-03-01T00:00:${String(i).padStart(2, '0')}.000Z`,
          }));
        const basis = titheBasisFor(toMinor(amount));
        expect(sumMinor(adjustmentTitheDeltas(basis, adjustments).values())).toBe(0 - basis.titheMinor);
        expect(netTithe(basis, adjustments)).toBe(0);
      }),
    );
  });

  it('refuses refunds above the received amount, zero/negative refunds and a tampered stored tithe', () => {
    const basis = titheBasisFor(toMinor(1000));
    const at = (id: string, amount: number, on = '2026-10-05'): AdjustmentInput => ({
      id,
      amountMinor: amount as Minor,
      effectiveOn: toLocalDate(on) as LocalDate,
      createdAt: '2026-10-05T00:00:00.000Z',
    });
    expect(() => adjustmentTitheDeltas(basis, [at('a', 600), at('b', 401)])).toThrow(RangeError);
    expect(() => adjustmentTitheDeltas(basis, [at('a', 0)])).toThrow(RangeError);
    expect(() => adjustmentTitheDeltas(basis, [at('a', -5)])).toThrow(RangeError);
    expect(() => adjustmentTitheDeltas(basis, [at('a', 1.5)])).toThrow(RangeError);
    expect(() => adjustmentTitheDeltas({ ...basis, titheMinor: toMinor(101) }, [])).toThrow(RangeError);
    expect(() => remainingRefundable(basis, [at('a', 1001)])).toThrow(RangeError);
  });

  it('refuses duplicate adjustment ids instead of silently dropping a delta', () => {
    const basis = titheBasisFor(toMinor(1000)); // tithe 100
    const twin = (amount: number, on: string): AdjustmentInput => ({
      id: 'same',
      amountMinor: toMinor(amount),
      effectiveOn: toLocalDate(on),
      createdAt: `${on}T00:00:00.000Z`,
    });
    expect(() => netTithe(basis, [twin(500, '2026-10-05'), twin(500, '2026-10-06')])).toThrow(RangeError);
  });
});

describe('checkRefundAmount', () => {
  it('accepts exactly the remaining refundable amount and nothing more', () => {
    fc.assert(
      fc.property(refundedIncomeArb, ({ amount, adjustments }) => {
        const refundable = remainingRefundable({ amountMinor: amount }, adjustments);
        if (refundable > 0) {
          expect(checkRefundAmount({ amountMinor: amount }, adjustments, refundable)).toEqual({ ok: true, remainingAfterMinor: 0 });
        }
        expect(checkRefundAmount({ amountMinor: amount }, adjustments, toMinor(refundable + 1))).toEqual({
          ok: false,
          error: 'exceeds_refundable',
          refundableMinor: refundable,
        });
        expect(checkRefundAmount({ amountMinor: amount }, adjustments, toMinor(0)).ok).toBe(false);
      }),
    );
  });
});
