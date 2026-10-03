/**
 * Adversarial tests for payment allocation proposals and validation (ARCHITECTURE §3.6).
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { toLocalDate } from './dates';
import { toMinor, type Minor } from './money';
import { proposeAllocation, validateAllocation, type AllocationLine } from './allocation';
import type { BucketPosition } from './balances';
import { periodRangeForYear } from './periods';

const trackingStart = toLocalDate('2024-01-01');

/** A bucket position with only the fields allocation reads being meaningful. */
function bucket(year: number, outstanding: number): BucketPosition {
  const zero = toMinor(0);
  return {
    currency: 'CAD',
    year,
    range: periodRangeForYear(year, trackingStart),
    grossIncomeMinor: zero,
    refundedMinor: zero,
    netIncomeMinor: zero,
    incomeTitheMinor: zero,
    adjustmentTitheMinor: zero,
    openingMinor: zero,
    accruedMinor: toMinor(outstanding),
    allocatedMinor: zero,
    creditAppliedMinor: zero,
    overCoveredMinor: zero,
    outstandingMinor: toMinor(Math.max(0, outstanding)),
  };
}

const bucketsArb = fc
  .uniqueArray(fc.integer({ min: 2020, max: 2035 }), { maxLength: 8 })
  .chain((years) =>
    fc.tuple(...years.map((year) => fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 1_000_000 })).map((o) => bucket(year, o)))),
  );

describe('proposeAllocation', () => {
  it('fills the oldest outstanding buckets first, never exceeds a bucket, and conserves the payment', () => {
    fc.assert(
      fc.property(bucketsArb, fc.integer({ min: 1, max: 5_000_000 }), (buckets, amount) => {
        const proposal = proposeAllocation(toMinor(amount), buckets);
        const total = proposal.allocations.reduce((s, a) => s + a.amountMinor, 0);
        const due = buckets.reduce((s, b) => s + b.outstandingMinor, 0);
        expect(total + proposal.creditMinor).toBe(amount);
        expect(total).toBe(Math.min(amount, due));
        expect(proposal.creditMinor).toBe(Math.max(0, amount - due));

        const years = proposal.allocations.map((a) => a.bucketYear);
        expect(years).toEqual([...years].sort((a, b) => a - b));
        for (const line of proposal.allocations) {
          expect(line.amountMinor).toBeGreaterThan(0);
          const target = buckets.find((b) => b.year === line.bucketYear);
          expect(line.amountMinor).toBeLessThanOrEqual(target?.outstandingMinor ?? 0);
        }
        // every outstanding bucket older than the newest one touched is filled completely
        const newest = Math.max(...years);
        for (const b of buckets.filter((x) => x.year < newest && x.outstandingMinor > 0)) {
          expect(proposal.allocations.find((a) => a.bucketYear === b.year)?.amountMinor).toBe(b.outstandingMinor);
        }
        // the proposal always passes validation with the same credit
        expect(validateAllocation(toMinor(amount), proposal.allocations, buckets)).toEqual({ ok: true, creditMinor: proposal.creditMinor });
      }),
      { numRuns: 1000 },
    );
  });

  it('with nothing outstanding (empty ledger) the whole payment is credit', () => {
    expect(proposeAllocation(toMinor(500), [])).toEqual({ allocations: [], creditMinor: 500 });
    expect(proposeAllocation(toMinor(500), [bucket(2026, 0), bucket(2027, -40)])).toEqual({ allocations: [], creditMinor: 500 });
  });

  it('refuses a negative or fractional payment instead of proposing negative credit', () => {
    expect(() => proposeAllocation(toMinor(-100), [bucket(2026, 50)])).toThrow(RangeError);
    expect(() => proposeAllocation(1.5 as Minor, [bucket(2026, 50)])).toThrow(RangeError);
    expect(proposeAllocation(toMinor(0), [bucket(2026, 50)])).toEqual({ allocations: [], creditMinor: 0 });
  });
});

describe('validateAllocation', () => {
  const buckets = [bucket(2025, 3000), bucket(2026, 500), bucket(2027, 0)];
  const line = (bucketYear: number, amount: number): AllocationLine => ({ bucketYear, amountMinor: amount as Minor });

  it('accepts an empty allocation (all credit) and exact limits', () => {
    expect(validateAllocation(toMinor(100), [], buckets)).toEqual({ ok: true, creditMinor: 100 });
    expect(validateAllocation(toMinor(3500), [line(2025, 3000), line(2026, 500)], buckets)).toEqual({ ok: true, creditMinor: 0 });
  });

  it('rejects each violation with the documented code, in the documented order', () => {
    expect(validateAllocation(toMinor(0), [], buckets)).toEqual({ ok: false, error: 'non_positive' });
    expect(validateAllocation(toMinor(-5), [], buckets)).toEqual({ ok: false, error: 'non_positive' });
    expect(validateAllocation(toMinor(100), [line(2025, 0)], buckets)).toMatchObject({ error: 'non_positive', bucketYear: 2025 });
    expect(validateAllocation(toMinor(100), [line(2025, -1)], buckets)).toMatchObject({ error: 'non_positive' });
    expect(validateAllocation(toMinor(100), [line(2025, 0.5)], buckets)).toMatchObject({ error: 'non_positive' });
    expect(validateAllocation(toMinor(100), [line(2025, 10), line(2025, 10)], buckets)).toMatchObject({ error: 'duplicate_bucket', bucketYear: 2025 });
    expect(validateAllocation(toMinor(100), [line(2031, 10)], buckets)).toMatchObject({ error: 'unknown_bucket', bucketYear: 2031 });
    expect(validateAllocation(toMinor(100), [line(2027, 1)], buckets)).toMatchObject({ error: 'exceeds_bucket_outstanding', bucketYear: 2027 });
    expect(validateAllocation(toMinor(1000), [line(2026, 501)], buckets)).toMatchObject({ error: 'exceeds_bucket_outstanding', bucketYear: 2026 });
    expect(validateAllocation(toMinor(3499), [line(2025, 3000), line(2026, 500)], buckets)).toEqual({ ok: false, error: 'exceeds_payment' });
    // ordering: a non-positive line is reported before a duplicate or an unknown year
    expect(validateAllocation(toMinor(100), [line(2031, 5), line(2031, 0)], buckets)).toMatchObject({ error: 'non_positive' });
  });

  it('accepts a random split iff every line is within its bucket and the total within the payment', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.array(fc.record({ year: fc.constantFrom(2025, 2026, 2027), amount: fc.integer({ min: 1, max: 4000 }) }), { maxLength: 3 }),
        (amount, raw) => {
          const lines = raw.filter((l, i) => raw.findIndex((x) => x.year === l.year) === i).map((l) => line(l.year, l.amount));
          const total = lines.reduce((s, l) => s + l.amountMinor, 0);
          const withinBuckets = lines.every((l) => l.amountMinor <= (buckets.find((b) => b.year === l.bucketYear)?.outstandingMinor ?? 0));
          const verdict = validateAllocation(toMinor(amount), lines, buckets);
          expect(verdict.ok).toBe(withinBuckets && total <= amount);
          if (verdict.ok) expect(verdict.creditMinor).toBe(amount - total);
        },
      ),
    );
  });
});
