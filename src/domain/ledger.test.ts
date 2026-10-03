import { beforeEach, describe, expect, it } from 'vitest';
import { buildLedgerRows, filterLedgerRows, sortLedgerRows, totalsByCurrency } from './ledger';
import { adjustment, d, income, m, resetFixtureSequence, snapshot } from './testFixtures';

beforeEach(() => resetFixtureSequence());

function rows() {
  return buildLedgerRows(
    snapshot({
      incomes: [
        income({ amount: '1,750.00', on: '2026-10-03', id: 'a', source: 'Salary', category: 'Work' }),
        income({ amount: '249.99', on: '2026-10-04', id: 'b', source: 'freelance', note: 'Logo design' }),
        income({ amount: '500.00', on: '2026-11-01', id: 'c', currency: 'USD', source: null, note: 'Gift from Sam' }),
        income({ amount: '0.01', on: '2026-10-04', id: 'd', source: 'Bank interest' }),
      ],
      adjustments: [
        adjustment({ incomeId: 'b', amount: '49.99', on: '2026-10-10', id: 'r1' }),
        adjustment({ incomeId: 'b', amount: '100.00', on: '2026-10-11', id: 'r2' }),
      ],
    }),
  );
}

describe('buildLedgerRows', () => {
  it('derives refunds, net amounts and net tithe per entry, newest first', () => {
    const list = rows();
    expect(list.map((r) => r.income.id)).toEqual(['c', 'd', 'b', 'a']);
    const b = list.find((r) => r.income.id === 'b');
    expect(b).toMatchObject({ refundedMinor: m('149.99'), netAmountMinor: m('100.00'), netTitheMinor: m('10.00'), refundableMinor: m('100.00') });
    expect(b?.adjustments.map((a) => [a.id, a.titheDeltaMinor])).toEqual([
      ['r1', -500],
      ['r2', -1000],
    ]);
  });
});

describe('filter, sort and totals', () => {
  it('filters by case-insensitive query on source/category/note', () => {
    expect(filterLedgerRows(rows(), { query: 'SALARY' }).map((r) => r.income.id)).toEqual(['a']);
    expect(filterLedgerRows(rows(), { query: 'work' }).map((r) => r.income.id)).toEqual(['a']);
    expect(filterLedgerRows(rows(), { query: 'sam' }).map((r) => r.income.id)).toEqual(['c']);
    expect(filterLedgerRows(rows(), { query: '   ' })).toHaveLength(4);
  });

  it('filters by inclusive dates and currency', () => {
    expect(filterLedgerRows(rows(), { from: d('2026-10-04'), to: d('2026-10-04') }).map((r) => r.income.id)).toEqual(['d', 'b']);
    expect(filterLedgerRows(rows(), { currency: 'USD' }).map((r) => r.income.id)).toEqual(['c']);
    expect(filterLedgerRows(rows(), { currency: 'all' })).toHaveLength(4);
  });

  it('sorts deterministically', () => {
    expect(sortLedgerRows(rows(), 'date_asc').map((r) => r.income.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(sortLedgerRows(rows(), 'amount_desc').map((r) => r.income.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(sortLedgerRows(rows(), 'amount_asc').map((r) => r.income.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(sortLedgerRows(rows(), 'source_asc').map((r) => r.income.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('totals per currency without mixing', () => {
    const totals = totalsByCurrency(rows());
    expect(totals.CAD).toEqual({
      count: 3,
      grossMinor: m('2,000.00'),
      refundedMinor: m('149.99'),
      netMinor: m('1,850.01'),
      titheMinor: m('185.00'),
    });
    expect(totals.USD).toEqual({ count: 1, grossMinor: m('500.00'), refundedMinor: 0, netMinor: m('500.00'), titheMinor: m('50.00') });
    const filtered = totalsByCurrency(filterLedgerRows(rows(), { currency: 'USD' }));
    expect(filtered.CAD.count).toBe(0);
  });
});
