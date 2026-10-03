/**
 * Adversarial tests for buckets, balances and credit (ARCHITECTURE §3.4–3.7).
 *
 * Two independent oracles are used:
 *  1. A reference model written straight from §3.7 (own tithe formula, own refund telescoping,
 *     own pool application) compared field by field with `computeBalances`.
 *  2. A workflow simulation (income, refunds in any later year, openings, payments built with
 *     `proposeAllocation` or hand-edited within limits, reversals) checking what the owner would see.
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { CURRENCIES, MAX_AMOUNT_MINOR, type Currency } from './constants';
import { toLocalDate } from './dates';
import { toMinor, type Minor } from './money';
import { BalanceInvariantError, carriedOverMinor, computeBalances, summarizePeriod, type CurrencyBalance } from './balances';
import { proposeAllocation, validateAllocation } from './allocation';
import { deriveObligationEvents } from './obligations';
import { emptySnapshot, type LedgerSnapshot, type PaymentRecord } from './records';
import { checkRefundAmount } from './tithe';
import { adjustment, income, m, opening, payment, resetFixtureSequence, snapshot } from './testFixtures';

const trackingStart = toLocalDate('2024-01-01');
beforeEach(() => resetFixtureSequence());

// ---------------------------------------------------------------------------------------------
// Reference model (§3.3, §3.4, §3.7), deliberately not sharing code with the implementation
// ---------------------------------------------------------------------------------------------

const refTithe = (cents: number): number => Math.floor(cents / 10) + (cents % 10 >= 5 ? 1 : 0);
const yearOfDate = (date: string): number => Number(date.slice(0, 4));

interface RefBucket {
  year: number;
  accrued: number;
  allocated: number;
  creditApplied: number;
  outstanding: number;
}

function referenceBalance(snap: LedgerSnapshot, currency: Currency) {
  const accruedByYear = new Map<number, number>();
  const allocatedByYear = new Map<number, number>();
  const bump = (map: Map<number, number>, year: number, by: number) => map.set(year, (map.get(year) ?? 0) + by);

  for (const inc of snap.incomes.filter((i) => i.currency === currency)) {
    bump(accruedByYear, yearOfDate(inc.receivedOn), refTithe(inc.amountMinor));
    const refunds = snap.adjustments
      .filter((a) => a.incomeId === inc.id)
      .sort((a, b) => (a.effectiveOn < b.effectiveOn ? -1 : a.effectiveOn > b.effectiveOn ? 1 : 0) || Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : 1));
    let left = inc.amountMinor as number;
    for (const r of refunds) {
      const before = refTithe(left);
      left -= r.amountMinor;
      bump(accruedByYear, yearOfDate(r.effectiveOn), refTithe(left) - before);
    }
  }
  for (const o of snap.openings.filter((x) => x.currency === currency)) bump(accruedByYear, yearOfDate(o.effectiveOn), o.amountMinor);
  let paid = 0;
  let allocatedTotal = 0;
  for (const p of snap.payments.filter((x) => x.currency === currency)) {
    paid += p.amountMinor;
    for (const a of p.allocations) {
      bump(allocatedByYear, a.bucketYear, a.amountMinor);
      allocatedTotal += a.amountMinor;
    }
  }
  const years = [...new Set([...accruedByYear.keys(), ...allocatedByYear.keys()])].sort((a, b) => a - b);
  const accrued = [...accruedByYear.values()].reduce((s, v) => s + v, 0);
  let pool = paid - allocatedTotal;
  for (const y of years) pool += Math.max(0, (allocatedByYear.get(y) ?? 0) - (accruedByYear.get(y) ?? 0));
  const buckets: RefBucket[] = years.map((year) => {
    const a = accruedByYear.get(year) ?? 0;
    const l = allocatedByYear.get(year) ?? 0;
    const position = a - l;
    const creditApplied = position > 0 ? Math.min(pool, position) : 0;
    pool -= creditApplied;
    return { year, accrued: a, allocated: l, creditApplied, outstanding: Math.max(0, position - creditApplied) };
  });
  return { accrued, paid, stillToGive: Math.max(0, accrued - paid), credit: Math.max(0, paid - accrued), remainingPool: pool, buckets };
}

function expectMatchesReference(snap: LedgerSnapshot): Record<Currency, CurrencyBalance> {
  const balances = computeBalances(snap, trackingStart);
  for (const currency of CURRENCIES) {
    const ref = referenceBalance(snap, currency);
    const actual = balances[currency];
    expect(actual.accruedMinor).toBe(ref.accrued);
    expect(actual.paidMinor).toBe(ref.paid);
    expect(actual.stillToGiveMinor).toBe(ref.stillToGive);
    expect(actual.creditMinor).toBe(ref.credit);
    expect(actual.creditMinor).toBe(ref.remainingPool);
    expect(
      actual.buckets.map((b) => ({
        year: b.year,
        accrued: b.accruedMinor,
        allocated: b.allocatedMinor,
        creditApplied: b.creditAppliedMinor,
        outstanding: b.outstandingMinor,
      })),
    ).toEqual(ref.buckets);
    const sumOutstanding = actual.buckets.reduce((s, b) => s + b.outstandingMinor, 0);
    expect(sumOutstanding).toBe(actual.stillToGiveMinor);
  }
  return balances;
}

// ---------------------------------------------------------------------------------------------
// Workflow simulation
// ---------------------------------------------------------------------------------------------

const YEARS = [2024, 2025, 2026, 2027, 2028];
const yearArb = fc.constantFrom(...YEARS);
const dayArb = fc.record({ month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }) });
const dateIn = (year: number, { month, day }: { month: number; day: number }) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const currencyArb = fc.constantFrom<Currency>(...CURRENCIES);
const amountArb = fc.oneof(
  fc.integer({ min: 1, max: 30 }), // rounding-sensitive cents
  fc.integer({ min: 1, max: 2_000_000 }),
  fc.constant(MAX_AMOUNT_MINOR),
);

type Op =
  | { kind: 'income'; currency: Currency; amount: number; year: number; day: { month: number; day: number } }
  | { kind: 'refund'; pick: number; share: number; full: boolean; yearsLater: number; day: { month: number; day: number } }
  | { kind: 'opening'; currency: Currency; amount: number; year: number; day: { month: number; day: number } }
  | { kind: 'payProposed'; currency: Currency; amount: number; year: number; day: { month: number; day: number } }
  | { kind: 'payCustom'; currency: Currency; amount: number; shares: number[]; year: number; day: { month: number; day: number } }
  | { kind: 'reverse'; pick: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('income' as const), currency: currencyArb, amount: amountArb, year: yearArb, day: dayArb }) },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('refund' as const),
      pick: fc.nat(),
      share: fc.integer({ min: 1, max: 100 }),
      full: fc.boolean(),
      yearsLater: fc.integer({ min: 0, max: 3 }),
      day: dayArb,
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('opening' as const), currency: currencyArb, amount: amountArb, year: yearArb, day: dayArb }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('payProposed' as const), currency: currencyArb, amount: amountArb, year: yearArb, day: dayArb }) },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('payCustom' as const),
      currency: currencyArb,
      amount: amountArb,
      shares: fc.array(fc.integer({ min: 0, max: 100 }), { minLength: YEARS.length, maxLength: YEARS.length }),
      year: yearArb,
      day: dayArb,
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('reverse' as const), pick: fc.nat() }) },
);

/** Applies one operation the way the services would (validating with domain functions first). */
function apply(snap: LedgerSnapshot, op: Op, step: number): LedgerSnapshot {
  const id = (prefix: string) => `${prefix}-${String(step).padStart(3, '0')}`;
  switch (op.kind) {
    case 'income':
      return { ...snap, incomes: [...snap.incomes, income({ id: id('inc'), currency: op.currency, amount: op.amount, on: dateIn(op.year, op.day) })] };
    case 'opening':
      return { ...snap, openings: [...snap.openings, opening({ id: id('open'), currency: op.currency, amount: op.amount, on: dateIn(op.year, op.day) })] };
    case 'refund': {
      const target = snap.incomes[op.pick % Math.max(1, snap.incomes.length)];
      if (!target) return snap;
      const existing = snap.adjustments.filter((a) => a.incomeId === target.id);
      const left = target.amountMinor - existing.reduce((s, a) => s + a.amountMinor, 0);
      const amount = op.full ? left : Math.max(1, Math.floor((left * op.share) / 100));
      if (!checkRefundAmount(target, existing, toMinor(amount)).ok) return snap;
      const incomeYear = yearOfDate(target.receivedOn);
      const on = op.yearsLater === 0 ? target.receivedOn : dateIn(incomeYear + op.yearsLater, op.day);
      return { ...snap, adjustments: [...snap.adjustments, adjustment({ id: id('adj'), incomeId: target.id, amount, on })] };
    }
    case 'payProposed': {
      const balance = computeBalances(snap, trackingStart)[op.currency];
      const proposal = proposeAllocation(toMinor(op.amount), balance.buckets);
      const allocations = proposal.allocations.map((a): [number, number] => [a.bucketYear, a.amountMinor]);
      return { ...snap, payments: [...snap.payments, payment({ id: id('pay'), currency: op.currency, amount: op.amount, on: dateIn(op.year, op.day), allocations })] };
    }
    case 'payCustom': {
      const balance = computeBalances(snap, trackingStart)[op.currency];
      let left = op.amount;
      const allocations: [number, number][] = [];
      balance.buckets.forEach((bucket, i) => {
        const share = op.shares[i % op.shares.length] ?? 0;
        const amount = Math.min(left, Math.floor((bucket.outstandingMinor * share) / 100));
        if (amount <= 0) return;
        left -= amount;
        allocations.push([bucket.year, amount]);
      });
      const lines = allocations.map(([bucketYear, amount]) => ({ bucketYear, amountMinor: toMinor(amount) }));
      const verdict = validateAllocation(toMinor(op.amount), lines, balance.buckets);
      expect(verdict).toEqual({ ok: true, creditMinor: left });
      return { ...snap, payments: [...snap.payments, payment({ id: id('pay'), currency: op.currency, amount: op.amount, on: dateIn(op.year, op.day), allocations })] };
    }
    case 'reverse': {
      if (snap.payments.length === 0) return snap;
      const victim = op.pick % snap.payments.length;
      return { ...snap, payments: snap.payments.filter((_, i) => i !== victim) };
    }
  }
}

describe('balances agree with the §3.7 reference model through random workflows', () => {
  it('after every step: reference match, Σ outstanding = still to give, pool remainder = credit', () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 30 }), (ops) => {
        let snap = emptySnapshot();
        ops.forEach((op, step) => {
          const before = computeBalances(snap, trackingStart);
          snap = apply(snap, op, step);
          const after = expectMatchesReference(snap);

          for (const currency of CURRENCIES) {
            const b = after[currency];
            // accrued = Σ_income tithe(A − ΣR) + Σ openings: refunds never push total accrued below zero
            expect(b.accruedMinor).toBeGreaterThanOrEqual(0);
            expect(b.stillToGiveMinor === 0 || b.creditMinor === 0).toBe(true);
            for (const bucket of b.buckets) {
              expect(bucket.outstandingMinor).toBeGreaterThanOrEqual(0);
              expect(bucket.creditAppliedMinor).toBeGreaterThanOrEqual(0);
              expect(bucket.outstandingMinor).toBe(Math.max(0, bucket.accruedMinor - bucket.allocatedMinor - bucket.creditAppliedMinor));
            }
          }

          if (op.kind === 'payProposed' || op.kind === 'payCustom') {
            const prev = before[op.currency];
            const next = after[op.currency];
            const saved = snap.payments.at(-1) as PaymentRecord;
            const allocated = saved.allocations.reduce((s, a) => s + a.amountMinor, 0);
            if (op.kind === 'payProposed') {
              // the proposal covers exactly what is due, oldest first, then credit
              expect(allocated).toBe(Math.min(op.amount, prev.stillToGiveMinor));
              const filledYears = saved.allocations.map((a) => a.bucketYear);
              for (const bucket of prev.buckets) {
                const line = saved.allocations.find((a) => a.bucketYear === bucket.year);
                const laterFilled = filledYears.some((y) => y > bucket.year);
                if (laterFilled) expect(line?.amountMinor ?? 0).toBe(bucket.outstandingMinor);
              }
            }
            expect(next.stillToGiveMinor).toBe(Math.max(0, prev.stillToGiveMinor - op.amount));
            expect(next.creditMinor).toBe(prev.creditMinor + Math.max(0, op.amount - prev.stillToGiveMinor));
            if (allocated === op.amount) {
              // no new credit: each bucket's outstanding drops by exactly its allocation
              for (const bucket of prev.buckets) {
                const line = saved.allocations.find((a) => a.bucketYear === bucket.year)?.amountMinor ?? 0;
                expect(next.buckets.find((x) => x.year === bucket.year)?.outstandingMinor).toBe(bucket.outstandingMinor - line);
              }
            }
          }
        });
      }),
      { numRuns: 250 },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Targeted scenarios
// ---------------------------------------------------------------------------------------------

describe('targeted scenarios', () => {
  it('empty ledger: zero everywhere, no buckets, no activity, summaries are zero', () => {
    const balances = computeBalances(emptySnapshot(), trackingStart);
    for (const currency of CURRENCIES) {
      const b = balances[currency];
      expect(b).toMatchObject({ accruedMinor: 0, paidMinor: 0, stillToGiveMinor: 0, creditMinor: 0, creditPoolMinor: 0, hasActivity: false, buckets: [] });
      expect(summarizePeriod(b, emptySnapshot(), 'all', trackingStart, toLocalDate('2026-10-03'))).toMatchObject({ outstandingMinor: 0, givenMinor: 0, entryCount: 0 });
      expect(summarizePeriod(b, emptySnapshot(), 2026, trackingStart, toLocalDate('2026-10-03'))).toMatchObject({ outstandingMinor: 0, accruedMinor: 0 });
      expect(carriedOverMinor(b, 2026)).toBe(0);
    }
  });

  it('refund in a later year than its income, nothing paid: the later bucket goes negative and offsets the earlier one', () => {
    const inc = income({ id: 'i1', amount: '1,000.00', on: '2026-11-01' }); // tithe 100.00
    const snap = snapshot({ incomes: [inc], adjustments: [adjustment({ incomeId: 'i1', amount: '500.00', on: '2027-02-01' })] });
    const cad = expectMatchesReference(snap).CAD;
    const [y2026, y2027] = cad.buckets;
    expect(y2026).toMatchObject({ year: 2026, accruedMinor: m('100.00'), creditAppliedMinor: m('50.00'), outstandingMinor: m('50.00') });
    expect(y2027).toMatchObject({ year: 2027, accruedMinor: -m('50.00'), netIncomeMinor: -m('500.00'), outstandingMinor: 0 });
    expect(cad.stillToGiveMinor).toBe(m('50.00'));
    expect(cad.creditMinor).toBe(0);
    expect(carriedOverMinor(cad, 2027)).toBe(m('50.00'));
  });

  it('bucket paid in full, then fully refunded in a later year: the payment becomes credit', () => {
    const snap = snapshot({
      incomes: [income({ id: 'i1', amount: '1,000.00', on: '2026-11-01' })],
      payments: [payment({ amount: '100.00', on: '2026-12-01', allocations: [[2026, '100.00']] })],
      adjustments: [adjustment({ incomeId: 'i1', amount: '1,000.00', on: '2027-01-10' })],
    });
    const cad = expectMatchesReference(snap).CAD;
    expect(cad.accruedMinor).toBe(0);
    expect(cad.stillToGiveMinor).toBe(0);
    expect(cad.creditMinor).toBe(m('100.00'));
    // the credit then covers new income in another year automatically
    const later = expectMatchesReference({ ...snap, incomes: [...snap.incomes, income({ amount: '600.00', on: '2028-03-01' })] }).CAD;
    expect(later.stillToGiveMinor).toBe(0);
    expect(later.creditMinor).toBe(m('40.00'));
    expect(later.buckets.find((b) => b.year === 2028)).toMatchObject({ creditAppliedMinor: m('60.00'), outstandingMinor: 0 });
  });

  it('allocation to a bucket that later shrinks (same-year refund) spills over to the oldest unpaid bucket', () => {
    const snap = snapshot({
      incomes: [income({ id: 'old', amount: '300.00', on: '2025-06-01' }), income({ id: 'new', amount: '1,000.00', on: '2026-10-05' })],
      payments: [payment({ amount: '100.00', on: '2026-10-10', allocations: [[2026, '100.00']] })],
      adjustments: [adjustment({ incomeId: 'new', amount: '400.00', on: '2026-10-20' })],
    });
    const cad = expectMatchesReference(snap).CAD;
    // 2026 accrued 60, allocated 100 -> over-covered 40 -> applied to 2025 (accrued 30) then nothing left to apply
    expect(cad.buckets.find((b) => b.year === 2026)).toMatchObject({ overCoveredMinor: m('40.00'), outstandingMinor: 0 });
    expect(cad.buckets.find((b) => b.year === 2025)).toMatchObject({ creditAppliedMinor: m('30.00'), outstandingMinor: 0 });
    expect(cad.creditMinor).toBe(m('10.00'));
  });

  it('payment with zero allocations is pure credit, applied oldest first', () => {
    const snap = snapshot({
      incomes: [income({ amount: '100.00', on: '2025-03-01' }), income({ amount: '200.00', on: '2026-10-05' })],
      payments: [payment({ amount: '25.00', on: '2026-10-06' })],
    });
    const cad = expectMatchesReference(snap).CAD;
    expect(cad.unallocatedMinor).toBe(m('25.00'));
    expect(cad.buckets.map((b) => [b.year, b.creditAppliedMinor, b.outstandingMinor])).toEqual([
      [2025, m('10.00'), 0],
      [2026, m('15.00'), m('5.00')],
    ]);
  });

  it('allocation to a year with no obligations creates a bucket that is fully over-covered', () => {
    const snap = snapshot({
      incomes: [income({ amount: '100.00', on: '2026-10-05' })],
      payments: [payment({ amount: '10.00', on: '2026-10-06', allocations: [[2030, '10.00']] })],
    });
    const cad = expectMatchesReference(snap).CAD;
    expect(cad.buckets.map((b) => b.year)).toEqual([2026, 2030]);
    expect(cad.stillToGiveMinor).toBe(0);
    expect(cad.creditMinor).toBe(0);
  });

  it('CAD and USD with interleaved years never mix', () => {
    const snap = snapshot({
      incomes: [
        income({ amount: '1,000.00', on: '2025-02-01', currency: 'USD' }),
        income({ amount: '1,000.00', on: '2026-10-05', currency: 'CAD' }),
        income({ amount: '500.00', on: '2027-01-05', currency: 'USD' }),
      ],
      openings: [opening({ amount: '20.00', on: '2024-12-31', currency: 'CAD' })],
      payments: [
        payment({ amount: '500.00', on: '2026-10-06', currency: 'CAD', allocations: [[2024, '20.00'], [2026, '100.00']] }),
        payment({ amount: '30.00', on: '2027-01-06', currency: 'USD' }),
      ],
    });
    const { CAD, USD } = expectMatchesReference(snap);
    expect(CAD.creditMinor).toBe(m('380.00'));
    expect(USD.stillToGiveMinor).toBe(m('120.00'));
    expect(USD.buckets.map((b) => [b.year, b.outstandingMinor])).toEqual([
      [2025, m('70.00')],
      [2027, m('50.00')],
    ]);
  });

  it('rejects corrupt payment allocations instead of producing misleading balances', () => {
    const base = { incomes: [income({ amount: '100.00', on: '2026-10-05' })] };
    const overAllocated = payment({ amount: '5.00', on: '2026-10-06', allocations: [[2026, '6.00']] });
    expect(() => computeBalances(snapshot({ ...base, payments: [overAllocated] }), trackingStart)).toThrow(BalanceInvariantError);

    const negativeLine = payment({ amount: '5.00', on: '2026-10-06', allocations: [[2026, '5.00']] });
    negativeLine.allocations = [
      { bucketYear: 2026, amountMinor: toMinor(800) },
      { bucketYear: 2027, amountMinor: toMinor(-300) },
    ];
    expect(() => computeBalances(snapshot({ ...base, payments: [negativeLine] }), trackingStart)).toThrow(BalanceInvariantError);

    const duplicateYear = payment({ amount: '5.00', on: '2026-10-06', allocations: [[2026, '2.00'], [2026, '3.00']] });
    expect(() => computeBalances(snapshot({ ...base, payments: [duplicateYear] }), trackingStart)).toThrow(BalanceInvariantError);

    const zeroPayment = payment({ amount: '5.00', on: '2026-10-06' });
    zeroPayment.amountMinor = 0 as Minor;
    expect(() => computeBalances(snapshot({ ...base, payments: [zeroPayment] }), trackingStart)).toThrow(BalanceInvariantError);
  });
});

describe('very large sums near the safe limit', () => {
  const MAX = MAX_AMOUNT_MINOR;

  it('90,071 maximum incomes are summed exactly; 90,072 throw instead of losing precision', () => {
    const many = (n: number) =>
      snapshot({
        incomes: Array.from({ length: n }, (_, i) =>
          income({ amount: MAX, on: '2026-10-05', id: `big-${String(i).padStart(6, '0')}`, createdAt: '2026-10-05T00:00:00.000Z' }),
        ),
      });
    const ok = computeBalances(many(90_071), trackingStart).CAD;
    expect(ok.grossIncomeMinor).toBe(Number(90_071n * BigInt(MAX)));
    expect(ok.accruedMinor).toBe(90_071 * 10_000_000_000);
    expect(ok.stillToGiveMinor).toBe(ok.accruedMinor);
    expect(() => computeBalances(many(90_072), trackingStart)).toThrow(RangeError);
  });

  it('total paid overflowing the safe range throws (RangeError), never a silently rounded balance', () => {
    const payments = Array.from({ length: 90_072 }, (_, i) => payment({ amount: MAX, on: '2026-10-05', id: `p-${i}` }));
    expect(() => computeBalances(snapshot({ payments }), trackingStart)).toThrow(RangeError);
  });

  it('events derived from max-size records keep exact telescoping values', () => {
    const inc = income({ id: 'max', amount: MAX, on: '2026-10-05' });
    const adj = adjustment({ incomeId: 'max', amount: MAX - 4, on: '2027-01-01' }); // leaves 0.04 -> tithe 0.00
    const events = deriveObligationEvents(snapshot({ incomes: [inc], adjustments: [adj] }));
    expect(events.map((e) => e.amountMinor)).toEqual([10_000_000_000, -10_000_000_000]);
  });
});
