import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { CURRENCIES, type Currency } from './constants';
import { toLocalDate } from './dates';
import { sumMinor, toMinor } from './money';
import { carriedOverMinor, computeBalances, outstandingBuckets, periodHasActivity, summarizePeriod } from './balances';
import type { AdjustmentRecord, IncomeRecord, LedgerSnapshot, PaymentRecord } from './records';
import { adjustment, d, income, m, opening, payment, resetFixtureSequence, setAside, snapshot } from './testFixtures';

const trackingStart = toLocalDate('2026-10-03');

beforeEach(() => resetFixtureSequence());

describe('worked example (ARCHITECTURE §3.9)', () => {
  it('income 1,750.00 + 249.99 -> accrued 200.00; give 50 -> 150 outstanding; set aside 100 -> 50 still to set aside', () => {
    const incomes = [income({ amount: '1,750.00', on: '2026-10-03' }), income({ amount: '249.99', on: '2026-10-04' })];
    let cad = computeBalances(snapshot({ incomes }), trackingStart).CAD;
    expect(cad.grossIncomeMinor).toBe(m('1,999.99'));
    expect(cad.netIncomeMinor).toBe(m('1,999.99'));
    expect(cad.accruedMinor).toBe(m('200.00'));
    expect(cad.stillToGiveMinor).toBe(m('200.00'));

    const payments = [payment({ amount: '50.00', on: '2026-10-05', allocations: [[2026, '50.00']] })];
    cad = computeBalances(snapshot({ incomes, payments }), trackingStart).CAD;
    expect(cad.paidMinor).toBe(m('50.00'));
    expect(cad.stillToGiveMinor).toBe(m('150.00'));
    expect(cad.creditMinor).toBe(0);

    const setAsides = [setAside({ kind: 'reserve', amount: '100.00', on: '2026-10-06' })];
    cad = computeBalances(snapshot({ incomes, payments, setAsides }), trackingStart).CAD;
    expect(cad.stillToGiveMinor).toBe(m('150.00'));
    expect(cad.setAsideMinor).toBe(m('100.00'));
    expect(cad.stillToSetAsideMinor).toBe(m('50.00'));
  });

  it('keeps a 0.01 entry whose tithe is 0.00', () => {
    const cad = computeBalances(snapshot({ incomes: [income({ amount: '0.01', on: '2026-10-03' })] }), trackingStart).CAD;
    expect(cad.grossIncomeMinor).toBe(1);
    expect(cad.accruedMinor).toBe(0);
    expect(cad.hasActivity).toBe(true);
    expect(cad.buckets).toHaveLength(1);
  });
});

describe('currencies never mix', () => {
  it('computes CAD and USD independently', () => {
    const snap = snapshot({
      incomes: [
        income({ amount: '1,000.00', on: '2026-10-03', currency: 'CAD' }),
        income({ amount: '500.00', on: '2026-10-03', currency: 'USD' }),
      ],
      payments: [payment({ amount: '80.00', on: '2026-10-04', currency: 'USD', allocations: [[2026, '50.00']] })],
    });
    const { CAD, USD } = computeBalances(snap, trackingStart);
    expect(CAD.accruedMinor).toBe(m('100.00'));
    expect(CAD.paidMinor).toBe(0);
    expect(CAD.stillToGiveMinor).toBe(m('100.00'));
    expect(CAD.creditMinor).toBe(0);
    expect(USD.accruedMinor).toBe(m('50.00'));
    expect(USD.paidMinor).toBe(m('80.00'));
    expect(USD.stillToGiveMinor).toBe(0);
    expect(USD.creditMinor).toBe(m('30.00'));
  });

  it('reports no activity for an unused currency', () => {
    const { USD } = computeBalances(snapshot({ incomes: [income({ amount: '1.00', on: '2026-10-03' })] }), trackingStart);
    expect(USD.hasActivity).toBe(false);
    expect(USD.buckets).toEqual([]);
    expect(USD.stillToGiveMinor).toBe(0);
  });
});

describe('payments and credit', () => {
  it('supports partial payments', () => {
    const snap = snapshot({
      incomes: [income({ amount: '2,000.00', on: '2026-10-03' })],
      payments: [
        payment({ amount: '50.00', on: '2026-10-10', allocations: [[2026, '50.00']] }),
        payment({ amount: '25.50', on: '2026-11-10', allocations: [[2026, '25.50']] }),
      ],
    });
    const cad = computeBalances(snap, trackingStart).CAD;
    expect(cad.stillToGiveMinor).toBe(m('124.50'));
    expect(cad.buckets[0]?.outstandingMinor).toBe(m('124.50'));
  });

  it('keeps an overpayment as explicit credit; still to give is 0', () => {
    const snap = snapshot({
      incomes: [income({ amount: '2,000.00', on: '2026-10-03' })],
      payments: [payment({ amount: '250.00', on: '2026-10-10', allocations: [[2026, '200.00']] })],
    });
    const cad = computeBalances(snap, trackingStart).CAD;
    expect(cad.stillToGiveMinor).toBe(0);
    expect(cad.creditMinor).toBe(m('50.00'));
    expect(cad.unallocatedMinor).toBe(m('50.00'));
    expect(cad.creditPoolMinor).toBe(m('50.00'));
    expect(cad.paidMinor - cad.accruedMinor).toBe(cad.creditMinor);
  });

  it('applies credit to later buckets, oldest first', () => {
    const snap = snapshot({
      incomes: [
        income({ amount: '1,000.00', on: '2026-10-03' }), // 2026 tithe 100
        income({ amount: '800.00', on: '2027-02-01' }), // 2027 tithe 80
        income({ amount: '600.00', on: '2028-02-01' }), // 2028 tithe 60
      ],
      payments: [payment({ amount: '200.00', on: '2026-12-01', allocations: [[2026, '100.00']] })],
    });
    const cad = computeBalances(snap, trackingStart).CAD;
    const [b2026, b2027, b2028] = cad.buckets;
    expect(b2026).toMatchObject({ year: 2026, creditAppliedMinor: 0, outstandingMinor: 0 });
    expect(b2027).toMatchObject({ year: 2027, creditAppliedMinor: m('80.00'), outstandingMinor: 0 });
    expect(b2028).toMatchObject({ year: 2028, creditAppliedMinor: m('20.00'), outstandingMinor: m('40.00') });
    expect(cad.stillToGiveMinor).toBe(m('40.00'));
    expect(cad.creditMinor).toBe(0);
    expect(outstandingBuckets(cad).map((b) => b.year)).toEqual([2028]);
  });

  it('an unallocated payment covers the oldest obligation first', () => {
    const snap = snapshot({
      openings: [opening({ amount: '40.00', on: '2025-06-01' })],
      incomes: [income({ amount: '1,000.00', on: '2026-10-03' })],
      payments: [payment({ amount: '50.00', on: '2026-10-05' })],
    });
    const cad = computeBalances(snap, trackingStart).CAD;
    expect(cad.buckets.map((b) => [b.year, b.creditAppliedMinor, b.outstandingMinor])).toEqual([
      [2025, 4000, 0],
      [2026, 1000, 9000],
    ]);
  });

  it('turns over-coverage from a later same-year refund into credit', () => {
    const inc = income({ amount: '1,000.00', on: '2026-10-03', id: 'inc-1' });
    const snap = snapshot({
      incomes: [inc],
      adjustments: [adjustment({ incomeId: 'inc-1', amount: '400.00', on: '2026-11-01' })],
      payments: [payment({ amount: '100.00', on: '2026-10-10', allocations: [[2026, '100.00']] })],
    });
    const cad = computeBalances(snap, trackingStart).CAD;
    expect(cad.accruedMinor).toBe(m('60.00'));
    expect(cad.buckets[0]).toMatchObject({ overCoveredMinor: m('40.00'), outstandingMinor: 0 });
    expect(cad.creditMinor).toBe(m('40.00'));
    expect(cad.stillToGiveMinor).toBe(0);
    expect(cad.refundedMinor).toBe(m('400.00'));
    expect(cad.netIncomeMinor).toBe(m('600.00'));
  });

  it('turns over-coverage from a refund dated in the next year into credit', () => {
    const inc = income({ amount: '1,000.00', on: '2026-10-03', id: 'inc-1' });
    const snap = snapshot({
      incomes: [inc],
      adjustments: [adjustment({ incomeId: 'inc-1', amount: '400.00', on: '2027-01-15' })],
      payments: [payment({ amount: '100.00', on: '2026-10-10', allocations: [[2026, '100.00']] })],
    });
    const cad = computeBalances(snap, trackingStart).CAD;
    const [b2026, b2027] = cad.buckets;
    expect(b2026).toMatchObject({ accruedMinor: m('100.00'), outstandingMinor: 0 });
    expect(b2027).toMatchObject({ accruedMinor: -4000, netIncomeMinor: -40000, overCoveredMinor: m('40.00') });
    expect(cad.creditMinor).toBe(m('40.00'));
  });

  it('turns over-coverage from a deleted income into credit', () => {
    // income was deleted: the loader no longer passes it, but its adjustment row is orphaned
    const snap = snapshot({
      adjustments: [adjustment({ incomeId: 'deleted', amount: '10.00', on: '2026-10-05' })],
      payments: [payment({ amount: '100.00', on: '2026-10-10', allocations: [[2026, '100.00']] })],
    });
    const cad = computeBalances(snap, trackingStart).CAD;
    expect(cad.accruedMinor).toBe(0);
    expect(cad.refundedMinor).toBe(0);
    expect(cad.creditMinor).toBe(m('100.00'));
    expect(cad.buckets[0]?.overCoveredMinor).toBe(m('100.00'));
  });

  it('rejects a payment whose allocations exceed its amount', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-10-03' })],
      payments: [payment({ amount: '10.00', on: '2026-10-10', allocations: [[2026, '20.00']] })],
    });
    expect(() => computeBalances(snap, trackingStart)).toThrow(/allocates more/);
  });
});

describe('opening obligations and carry-over', () => {
  it('counts openings as obligations, never as income', () => {
    const cad = computeBalances(
      snapshot({ openings: [opening({ amount: '300.00', on: '2026-01-15' })] }),
      trackingStart,
    ).CAD;
    expect(cad.grossIncomeMinor).toBe(0);
    expect(cad.openingMinor).toBe(m('300.00'));
    expect(cad.accruedMinor).toBe(m('300.00'));
    expect(cad.stillToGiveMinor).toBe(m('300.00'));
    // dated before the tracking start but in the same year: lands in the 2026 bucket
    expect(cad.buckets[0]).toMatchObject({ year: 2026, openingMinor: m('300.00') });
    expect(cad.buckets[0]?.range.start).toBe('2026-10-03');
  });

  it('carries unpaid balances past Dec 31 into the next year without resetting', () => {
    const snap = snapshot({
      incomes: [income({ amount: '1,000.00', on: '2026-12-31' }), income({ amount: '500.00', on: '2027-01-01' })],
      payments: [payment({ amount: '30.00', on: '2026-12-31', allocations: [[2026, '30.00']] })],
    });
    const cad = computeBalances(snap, trackingStart).CAD;
    expect(cad.stillToGiveMinor).toBe(m('120.00'));
    expect(carriedOverMinor(cad, 2027)).toBe(m('70.00'));
    expect(carriedOverMinor(cad, 2026)).toBe(0);
    expect(cad.buckets.map((b) => b.range.label)).toEqual(['Oct 3 – Dec 31, 2026', 'Jan 1 – Dec 31, 2027']);
  });
});

describe('summarizePeriod', () => {
  const snap = (): LedgerSnapshot =>
    snapshot({
      incomes: [
        income({ amount: '1,750.00', on: '2026-10-03' }),
        income({ amount: '249.99', on: '2026-10-04' }),
        income({ amount: '100.00', on: '2027-03-01' }),
      ],
      openings: [opening({ amount: '20.00', on: '2026-05-01' })],
      payments: [payment({ amount: '60.00', on: '2026-10-05', allocations: [[2026, '50.00']] })],
    });

  it('summarises one bucket', () => {
    const s = snap();
    const cad = computeBalances(s, trackingStart).CAD;
    const summary = summarizePeriod(cad, s, 2026, trackingStart, d('2027-03-02'));
    expect(summary).toMatchObject({
      grossIncomeMinor: m('1,999.99'),
      accruedMinor: m('220.00'),
      openingMinor: m('20.00'),
      givenMinor: m('50.00'),
      creditAppliedMinor: m('10.00'),
      outstandingMinor: m('160.00'),
      entryCount: 2,
    });
    expect(summary.range.label).toBe('Oct 3 – Dec 31, 2026');
  });

  it('summarises all time', () => {
    const s = snap();
    const cad = computeBalances(s, trackingStart).CAD;
    const summary = summarizePeriod(cad, s, 'all', trackingStart, d('2027-03-02'));
    expect(summary).toMatchObject({
      grossIncomeMinor: m('2,099.99'),
      accruedMinor: m('230.00'),
      givenMinor: m('60.00'),
      outstandingMinor: m('170.00'),
      entryCount: 3,
    });
    expect(summary.range).toMatchObject({ start: '2026-05-01', end: '2027-03-02', label: 'All time' });
  });

  it('returns zeros for an empty year', () => {
    const s = snap();
    const cad = computeBalances(s, trackingStart).CAD;
    const summary = summarizePeriod(cad, s, 2028, trackingStart, d('2028-01-02'));
    expect(summary).toMatchObject({ accruedMinor: 0, outstandingMinor: 0, entryCount: 0 });
    expect(summary.range.start).toBe('2028-01-01');
  });
});

describe('periodHasActivity', () => {
  it('is true for a period with income, opening balance or payments, and false for an empty one', () => {
    const s = snapshot({
      incomes: [income({ amount: '100.00', on: '2026-10-03' }), income({ amount: '50.00', on: '2026-10-03', currency: 'USD' })],
      openings: [opening({ amount: '20.00', on: '2026-05-01' })],
    });
    const balances = computeBalances(s, trackingStart);
    const today = d('2027-01-02');
    expect(periodHasActivity(summarizePeriod(balances.CAD, s, 2026, trackingStart, today))).toBe(true);
    expect(periodHasActivity(summarizePeriod(balances.USD, s, 2026, trackingStart, today))).toBe(true);
    expect(periodHasActivity(summarizePeriod(balances.USD, s, 2027, trackingStart, today))).toBe(false);
    expect(periodHasActivity(summarizePeriod(balances.CAD, s, 2027, trackingStart, today))).toBe(false);
  });

  it('counts an opening balance alone as activity', () => {
    const s = snapshot({ openings: [opening({ amount: '20.00', on: '2026-05-01', currency: 'USD' })] });
    const usd = computeBalances(s, trackingStart).USD;
    expect(periodHasActivity(summarizePeriod(usd, s, 'all', trackingStart, d('2026-10-03')))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Property: invariants over random ledgers
// ---------------------------------------------------------------------------------------------

const YEARS = [2025, 2026, 2027, 2028];
const dateArb = fc
  .record({ year: fc.constantFrom(...YEARS), month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }) })
  .map(({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
const currencyArb = fc.constantFrom<Currency>(...CURRENCIES);
const amountArb = fc.oneof(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 5_000_000 }), fc.constant(99_999_999_999));

const ledgerArb = fc
  .record({
    incomes: fc.array(fc.record({ amount: amountArb, on: dateArb, currency: currencyArb, refunds: fc.array(fc.nat(100), { maxLength: 3 }) }), {
      maxLength: 12,
    }),
    openings: fc.array(fc.record({ amount: amountArb, on: dateArb, currency: currencyArb }), { maxLength: 3 }),
    payments: fc.array(
      fc.record({
        amount: amountArb,
        on: dateArb,
        currency: currencyArb,
        allocations: fc.array(fc.record({ year: fc.constantFrom(...YEARS), share: fc.nat(100) }), { maxLength: 3 }),
      }),
      { maxLength: 6 },
    ),
  })
  .map(({ incomes: incomeSpecs, openings: openingSpecs, payments: paymentSpecs }): LedgerSnapshot => {
    const incomes: IncomeRecord[] = [];
    const adjustments: AdjustmentRecord[] = [];
    incomeSpecs.forEach((spec, i) => {
      const record = income({ amount: spec.amount, on: spec.on, currency: spec.currency, id: `inc-${i}` });
      incomes.push(record);
      // refunds as percentages of what remains, dated on or after the income
      let remaining = spec.amount;
      spec.refunds.forEach((pct, k) => {
        const amount = Math.floor((remaining * pct) / 100);
        if (amount <= 0) return;
        remaining -= amount;
        const year = Math.max(Number(spec.on.slice(0, 4)), YEARS[k % YEARS.length] ?? 2025);
        const on = year === Number(spec.on.slice(0, 4)) ? spec.on : `${year}-01-15`;
        adjustments.push(adjustment({ incomeId: record.id, amount, on, id: `adj-${i}-${k}` }));
      });
    });
    const payments: PaymentRecord[] = paymentSpecs.map((spec, i) => {
      let left = spec.amount;
      const seen = new Set<number>();
      const allocations: [number, number][] = [];
      for (const { year, share } of spec.allocations) {
        if (seen.has(year)) continue;
        const amount = Math.floor((left * share) / 100);
        if (amount <= 0) continue;
        seen.add(year);
        left -= amount;
        allocations.push([year, amount]);
      }
      return payment({ amount: spec.amount, on: spec.on, currency: spec.currency, allocations, id: `pay-${i}` });
    });
    const openings = openingSpecs.map((spec, i) => opening({ ...spec, id: `open-${i}` }));
    return snapshot({ incomes, adjustments, openings, payments });
  });

describe('balance invariants (property)', () => {
  it('Σ outstanding == still to give, remaining pool == credit, and currencies are independent', () => {
    fc.assert(
      fc.property(ledgerArb, (snap) => {
        const balances = computeBalances(snap, trackingStart);
        for (const currency of CURRENCIES) {
          const b = balances[currency];
          const outstanding = sumMinor(b.buckets.map((x) => x.outstandingMinor));
          const applied = sumMinor(b.buckets.map((x) => x.creditAppliedMinor));
          expect(outstanding).toBe(b.stillToGiveMinor);
          expect(b.creditPoolMinor - applied).toBe(b.creditMinor);
          expect(b.stillToGiveMinor - b.creditMinor).toBe(b.accruedMinor - b.paidMinor);
          expect(b.stillToGiveMinor === 0 || b.creditMinor === 0).toBe(true);
          expect(b.creditMinor).toBeGreaterThanOrEqual(0);
          expect(b.accruedMinor).toBeGreaterThanOrEqual(0); // refunds never reduce below zero overall
          for (const bucket of b.buckets) {
            expect(bucket.outstandingMinor).toBeGreaterThanOrEqual(0);
            expect(bucket.creditAppliedMinor).toBeGreaterThanOrEqual(0);
          }
          const years = b.buckets.map((x) => x.year);
          expect([...years].sort((x, y) => x - y)).toEqual(years);

          // independence: removing the other currency's records changes nothing
          const only = snapshot({
            incomes: snap.incomes.filter((r) => r.currency === currency),
            adjustments: snap.adjustments.filter((a) => snap.incomes.find((r) => r.id === a.incomeId)?.currency === currency),
            openings: snap.openings.filter((r) => r.currency === currency),
            payments: snap.payments.filter((r) => r.currency === currency),
          });
          expect(computeBalances(only, trackingStart)[currency]).toEqual(b);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('handles the max safe amount without overflow', () => {
    const snap = snapshot({
      incomes: Array.from({ length: 50 }, (_, i) => income({ amount: '999,999,999.99', on: '2026-10-03', id: `big-${i}` })),
    });
    const cad = computeBalances(snap, trackingStart).CAD;
    expect(cad.accruedMinor).toBe(toMinor(50 * 10_000_000_000));
    expect(cad.grossIncomeMinor).toBe(toMinor(50 * 99_999_999_999));
  });
});
