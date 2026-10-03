import { beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from './dates';
import { proposeAllocation, validateAllocation, ALLOCATION_ERROR_MESSAGES } from './allocation';
import { computeBalances } from './balances';
import { toMinor } from './money';
import { income, m, opening, payment, resetFixtureSequence, snapshot } from './testFixtures';

const trackingStart = toLocalDate('2026-10-03');

beforeEach(() => resetFixtureSequence());

function buckets() {
  const snap = snapshot({
    openings: [opening({ amount: '40.00', on: '2025-06-01' })], // 2025: 40
    incomes: [income({ amount: '1,000.00', on: '2026-10-03' }), income({ amount: '500.00', on: '2027-02-01' })], // 2026: 100, 2027: 50
    payments: [payment({ amount: '30.00', on: '2026-10-05', allocations: [[2026, '30.00']] })],
  });
  return computeBalances(snap, trackingStart).CAD.buckets;
}

describe('proposeAllocation', () => {
  it('fills the oldest outstanding bucket first', () => {
    expect(proposeAllocation(m('100.00'), buckets())).toEqual({
      allocations: [
        { bucketYear: 2025, amountMinor: m('40.00') },
        { bucketYear: 2026, amountMinor: m('60.00') },
      ],
      creditMinor: 0,
    });
  });

  it('leaves the remainder as credit after everything is covered', () => {
    expect(proposeAllocation(m('200.00'), buckets())).toEqual({
      allocations: [
        { bucketYear: 2025, amountMinor: m('40.00') },
        { bucketYear: 2026, amountMinor: m('70.00') },
        { bucketYear: 2027, amountMinor: m('50.00') },
      ],
      creditMinor: m('40.00'),
    });
  });

  it('handles tiny payments and empty buckets', () => {
    expect(proposeAllocation(toMinor(1), buckets())).toEqual({
      allocations: [{ bucketYear: 2025, amountMinor: 1 }],
      creditMinor: 0,
    });
    expect(proposeAllocation(m('5.00'), [])).toEqual({ allocations: [], creditMinor: m('5.00') });
  });

  it('works on unsorted bucket input', () => {
    const reversed = [...buckets()].reverse();
    expect(proposeAllocation(m('50.00'), reversed).allocations[0]?.bucketYear).toBe(2025);
  });
});

describe('validateAllocation', () => {
  it('accepts a valid split and reports the credit remainder', () => {
    expect(
      validateAllocation(
        m('100.00'),
        [
          { bucketYear: 2027, amountMinor: m('50.00') },
          { bucketYear: 2026, amountMinor: m('20.00') },
        ],
        buckets(),
      ),
    ).toEqual({ ok: true, creditMinor: m('30.00') });
    expect(validateAllocation(m('10.00'), [], buckets())).toEqual({ ok: true, creditMinor: m('10.00') });
  });

  it.each([
    ['non_positive', m('10.00'), [{ bucketYear: 2026, amountMinor: toMinor(0) }]],
    ['non_positive', toMinor(0), []],
    [
      'duplicate_bucket',
      m('10.00'),
      [
        { bucketYear: 2026, amountMinor: m('1.00') },
        { bucketYear: 2026, amountMinor: m('1.00') },
      ],
    ],
    ['unknown_bucket', m('10.00'), [{ bucketYear: 2030, amountMinor: m('1.00') }]],
    ['exceeds_bucket_outstanding', m('100.00'), [{ bucketYear: 2025, amountMinor: m('40.01') }]],
    [
      'exceeds_payment',
      m('50.00'),
      [
        { bucketYear: 2025, amountMinor: m('40.00') },
        { bucketYear: 2026, amountMinor: m('10.01') },
      ],
    ],
  ] as const)('rejects %s', (error, amount, allocations) => {
    const result = validateAllocation(amount, allocations, buckets());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(error);
  });

  it('names the offending bucket', () => {
    expect(validateAllocation(m('100.00'), [{ bucketYear: 2025, amountMinor: m('41.00') }], buckets())).toEqual({
      ok: false,
      error: 'exceeds_bucket_outstanding',
      bucketYear: 2025,
    });
  });

  it('has a message per error', () => {
    expect(Object.keys(ALLOCATION_ERROR_MESSAGES)).toHaveLength(5);
  });
});
