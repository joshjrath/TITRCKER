import { describe, expect, it } from 'vitest';
import { monthlyRowKey, monthlyRowLabel, spansYears, type MonthlyBreakdownRow } from './monthly-rows';

const cells = { netIncomeMinor: 0, titheMinor: 0, paidMinor: 0 };

describe('monthlyRowLabel', () => {
  it('labels months, with the year when the rows span years', () => {
    const row: MonthlyBreakdownRow = { kind: 'month', monthKey: '2026-10', ...cells };
    expect(monthlyRowLabel(row, false)).toEqual({ text: 'Oct', spoken: 'October 2026' });
    expect(monthlyRowLabel({ monthKey: '2026-10', ...cells }, true)).toEqual({ text: 'Oct ’26', spoken: 'October 2026' });
  });

  it('labels the carry-in row as an opening balance when it holds tithe, otherwise as earlier giving', () => {
    expect(monthlyRowLabel({ kind: 'before', monthKey: '2026-10', date: '2026-10-03', ...cells, titheMinor: 5000 }, false)).toEqual({
      text: 'Before Oct 3',
      detail: 'Opening balance',
      spoken: 'Before Oct 3, 2026: opening balance',
    });
    expect(monthlyRowLabel({ kind: 'before', monthKey: '2026-10', date: '2026-10-03', ...cells, paidMinor: 100 }, false).detail).toBe('Given earlier');
  });

  it('labels later allocations', () => {
    expect(monthlyRowLabel({ kind: 'after', monthKey: '2026-12', date: '2026-12-31', ...cells, paidMinor: 2500 }, false)).toEqual({
      text: 'After Dec 31',
      detail: 'Given later',
      spoken: 'After Dec 31, 2026: given later',
    });
  });
});

describe('row keys and year spans', () => {
  it('keys rows uniquely and ignores before/after rows for the year span', () => {
    const rows: MonthlyBreakdownRow[] = [
      { kind: 'before', monthKey: '2026-10', date: '2026-10-03', ...cells },
      { kind: 'month', monthKey: '2026-12', ...cells },
      { kind: 'after', monthKey: '2026-12', date: '2026-12-31', ...cells },
    ];
    expect(rows.map(monthlyRowKey)).toEqual(['before', '2026-12', 'after']);
    expect(spansYears(rows)).toBe(false);
    expect(spansYears([...rows, { monthKey: '2027-01', ...cells }])).toBe(true);
  });
});
