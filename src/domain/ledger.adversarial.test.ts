/**
 * Adversarial tests for the income ledger view (ARCHITECTURE §8 "/ledger"): filters checked against
 * an independent predicate, sorts that are total orders (input-order independent), and per-currency
 * totals that agree with the tithe policy (§3.3–3.4) and with the balances.
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from './balances';
import { CURRENCIES } from './constants';
import { fromEpochDay, toEpochDay, type LocalDate } from './dates';
import { buildLedgerRows, filterLedgerRows, sortLedgerRows, totalsByCurrency, type LedgerFilter, type LedgerRow, type LedgerSort } from './ledger';
import type { LedgerSnapshot } from './records';
import { computeTithe } from './tithe';
import { adjustment, d, income, resetFixtureSequence, snapshot } from './testFixtures';
import { toMinor } from './money';

beforeEach(() => resetFixtureSequence());

const dateBetween = (min: string, max: string) =>
  fc.integer({ min: toEpochDay(d(min)), max: toEpochDay(d(max)) }).map(fromEpochDay);

const textArb = fc.option(fc.constantFrom('Salary', 'salary', 'SALARY', 'Freelance', 'gift from Sam', 'École', 'école', '', '  ', 'a.b*c', '100%'), { nil: null });

/** Ledgers with many ties: few dates, few amounts, duplicate createdAt timestamps and sources differing only by case. */
const ledgerArb = fc
  .array(
    fc.record({
      amount: fc.constantFrom(1, 5, 100, 24_999, 175_000),
      on: dateBetween('2026-10-03', '2026-10-06'),
      currency: fc.constantFrom('CAD' as const, 'USD' as const),
      source: textArb,
      category: textArb,
      note: textArb,
      createdAt: fc.constantFrom('2026-10-03T10:00:00.000Z', '2026-10-03T10:00:00Z', '2026-10-03T09:00:00.000Z'),
      refund: fc.integer({ min: 0, max: 200_000 }),
    }),
    { maxLength: 12 },
  )
  .map((specs): LedgerSnapshot => {
    const incomes = specs.map((s, i) => income({ ...s, id: `inc-${String(i).padStart(2, '0')}` }));
    const adjustments = specs.flatMap((s, i) =>
      s.refund > 0 ? [adjustment({ incomeId: `inc-${String(i).padStart(2, '0')}`, amount: Math.min(s.refund, s.amount), on: '2026-10-07' })] : [],
    );
    return snapshot({ incomes, adjustments });
  });

const shuffled = <T,>(items: readonly T[], seed: number): T[] => {
  const out = [...items];
  let state = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
};

const ids = (rows: readonly LedgerRow[]): string[] => rows.map((r) => r.income.id);
const SORTS: LedgerSort[] = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc', 'source_asc'];

describe('sortLedgerRows (properties)', () => {
  it('is a total order: the result never depends on the input order', () => {
    fc.assert(
      fc.property(ledgerArb, fc.constantFrom(...SORTS), fc.integer({ min: 1, max: 1_000_000 }), (snap, sort, seed) => {
        const rows = buildLedgerRows(snap);
        expect(ids(sortLedgerRows(shuffled(rows, seed), sort))).toEqual(ids(sortLedgerRows(rows, sort)));
        expect(ids(sortLedgerRows(sortLedgerRows(rows, 'source_asc'), sort))).toEqual(ids(sortLedgerRows(rows, sort)));
      }),
      { numRuns: 300 },
    );
  });

  it('orders by its key, and descending sorts are exact reverses of ascending ones', () => {
    fc.assert(
      fc.property(ledgerArb, (snap) => {
        const rows = buildLedgerRows(snap);
        expect(ids(rows)).toEqual(ids(sortLedgerRows(rows, 'date_desc')));
        expect(ids(sortLedgerRows(rows, 'date_desc'))).toEqual(ids(sortLedgerRows(rows, 'date_asc')).reverse());
        expect(ids(sortLedgerRows(rows, 'amount_desc'))).toEqual(ids(sortLedgerRows(rows, 'amount_asc')).reverse());

        const pairs = <T,>(xs: T[]): [T, T][] => xs.slice(1).map((x, i) => [xs[i] as T, x]);
        for (const [a, b] of pairs(sortLedgerRows(rows, 'date_asc'))) expect(a.income.receivedOn <= b.income.receivedOn).toBe(true);
        for (const [a, b] of pairs(sortLedgerRows(rows, 'amount_asc'))) expect(a.income.amountMinor <= b.income.amountMinor).toBe(true);
        const bySource = sortLedgerRows(rows, 'source_asc');
        const firstNull = bySource.findIndex((r) => r.income.source === null);
        if (firstNull >= 0) expect(bySource.slice(firstNull).every((r) => r.income.source === null)).toBe(true);
        for (const [a, b] of pairs(bySource)) {
          if (a.income.source !== null && b.income.source !== null) {
            expect(a.income.source.toLowerCase() <= b.income.source.toLowerCase()).toBe(true);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('filterLedgerRows (property)', () => {
  const filterArb = fc.record(
    {
      query: fc.constantFrom('', ' sal ', 'SALARY', 'sam', 'éCOLE', '.', '*', '%', 'zzz'),
      from: dateBetween('2026-10-02', '2026-10-07'),
      to: dateBetween('2026-10-02', '2026-10-07'),
      currency: fc.constantFrom('CAD' as const, 'USD' as const, 'all' as const),
    },
    { requiredKeys: [] },
  );

  /** Independent statement of the filter rules. */
  function matches(row: LedgerRow, f: LedgerFilter): boolean {
    const { income: r } = row;
    if (f.currency !== undefined && f.currency !== 'all' && r.currency !== f.currency) return false;
    if (f.from !== undefined && r.receivedOn < f.from) return false;
    if (f.to !== undefined && r.receivedOn > f.to) return false;
    const q = (f.query ?? '').trim().toLowerCase();
    if (q === '') return true;
    return [r.source, r.category, r.note].some((t) => t !== null && t.toLowerCase().includes(q));
  }

  it('keeps exactly the matching rows, in their original order', () => {
    fc.assert(
      fc.property(ledgerArb, filterArb, (snap, filter) => {
        const rows = buildLedgerRows(snap);
        expect(ids(filterLedgerRows(rows, filter))).toEqual(ids(rows.filter((r) => matches(r, filter))));
      }),
      { numRuns: 500 },
    );
  });

  it('an inverted date range is empty and a single day is inclusive', () => {
    const rows = buildLedgerRows(snapshot({ incomes: [income({ amount: '1.00', on: '2026-10-04' })] }));
    expect(filterLedgerRows(rows, { from: d('2026-10-05'), to: d('2026-10-03') })).toEqual([]);
    expect(filterLedgerRows(rows, { from: d('2026-10-04'), to: d('2026-10-04') })).toHaveLength(1);
  });
});

describe('totalsByCurrency (property)', () => {
  it('counts every row once, never mixes currencies, and nets tithe per entry', () => {
    fc.assert(
      fc.property(ledgerArb, (snap) => {
        const rows = buildLedgerRows(snap);
        const totals = totalsByCurrency(rows);
        expect(CURRENCIES.reduce((n, c) => n + totals[c].count, 0)).toBe(rows.length);
        const balances = computeBalances(snap, d('2026-10-03'));
        for (const currency of CURRENCIES) {
          const mine = rows.filter((r) => r.income.currency === currency);
          const t = totals[currency];
          expect(t.count).toBe(mine.length);
          expect(t.netMinor).toBe(t.grossMinor - t.refundedMinor);
          // §3.4: each entry's net tithe is tithe(amount − refunds), never 10% of a total.
          expect(t.titheMinor).toBe(mine.reduce((s, r) => s + computeTithe(toMinor(r.income.amountMinor - r.refundedMinor)), 0));
          expect(t.grossMinor).toBe(balances[currency].grossIncomeMinor);
          expect(t.refundedMinor).toBe(balances[currency].refundedMinor);
          expect(t.titheMinor).toBe(balances[currency].incomeTitheMinor + balances[currency].adjustmentTitheMinor);
        }
        for (const row of rows) expect(row.refundableMinor).toBe(row.netAmountMinor);
      }),
      { numRuns: 300 },
    );
  });

  it('totals of a filtered view equal the sum of the rows shown', () => {
    fc.assert(
      fc.property(ledgerArb, fc.constantFrom<LocalDate>(d('2026-10-04'), d('2026-10-05')), (snap, from) => {
        const view = filterLedgerRows(buildLedgerRows(snap), { from });
        const totals = totalsByCurrency(view);
        for (const currency of CURRENCIES) {
          const mine = view.filter((r) => r.income.currency === currency);
          expect(totals[currency].grossMinor).toBe(mine.reduce((s, r) => s + r.income.amountMinor, 0));
          expect(totals[currency].titheMinor).toBe(mine.reduce((s, r) => s + r.netTitheMinor, 0));
        }
      }),
    );
  });
});
