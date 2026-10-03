import { beforeEach, describe, expect, it } from 'vitest';
import { toLocalDate } from './dates';
import { computeBalances } from './balances';
import {
  buildFilteredLedgerCsv,
  buildLedgerCsv,
  escapeCsvCell,
  LEDGER_CSV_HEADER,
  neutralizeFormula,
  toCsv,
} from './csv';
import { buildLedgerRows } from './ledger';
import { adjustment, income, m, opening, payment, resetFixtureSequence, setAside, snapshot } from './testFixtures';

const trackingStart = toLocalDate('2026-10-03');

beforeEach(() => resetFixtureSequence());

/** Minimal RFC 4180 parser for round-trip assertions. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += ch;
  }
  return rows;
}

describe('escapeCsvCell (RFC 4180)', () => {
  it.each<[string, string]>([
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line1\nline2', '"line1\nline2"'],
    ['cr\rhere', '"cr\rhere"'],
    ['', ''],
  ])('%j -> %j', (input, output) => {
    expect(escapeCsvCell(input)).toBe(output);
  });
});

describe('neutralizeFormula', () => {
  it.each(['=SUM(A1)', '+1', '-1', '@cmd', '\tx', '\rx', '  =1+1', '＝1', '＋1', '－1', '＠x'])('neutralises %j', (text) => {
    expect(neutralizeFormula(text)).toBe(`'${text}`);
  });

  it.each(['Salary', '1+1', 'a=b', '', 'Gift - Sam', "'quoted"])('leaves %j alone', (text) => {
    expect(neutralizeFormula(text)).toBe(text);
  });
});

describe('toCsv', () => {
  it('uses CRLF, optional BOM, plain integers and empty nulls', () => {
    expect(toCsv(['a', 'b'], [['x,y', 12], [null, 'z']])).toBe('a,b\r\n"x,y",12\r\n,z\r\n');
    expect(toCsv(['a'], [], { bom: true })).toBe('﻿a\r\n');
    expect(() => toCsv(['a'], [[1.5]])).toThrow(RangeError);
  });
});

describe('buildLedgerCsv', () => {
  function fixture() {
    const snap = snapshot({
      incomes: [
        income({ amount: '1,750.00', on: '2026-10-03', id: 'inc-1', source: '=HYPERLINK("x")', note: 'line1\nline2, "quoted"' }),
        income({ amount: '249.99', on: '2026-10-04', id: 'inc-2', source: 'Freelance', category: '@risk' }),
        income({ amount: '100.00', on: '2026-10-05', id: 'inc-3', currency: 'USD' }),
      ],
      adjustments: [adjustment({ incomeId: 'inc-2', amount: '49.99', on: '2026-10-10', id: 'adj-1', reason: '-returned' })],
      openings: [opening({ amount: '20.00', on: '2026-01-01', id: 'open-1', label: '+old debt' })],
      payments: [
        payment({ amount: '60.00', on: '2026-10-20', id: 'pay-1', churchName: 'Grace, Downtown', reference: '=1+2', allocations: [[2026, '60.00']] }),
      ],
      setAsides: [setAside({ kind: 'reserve', amount: '25.00', on: '2026-10-21', id: 'sa-1', note: '＝cmd' })],
    });
    return { snap, balances: computeBalances(snap, trackingStart) };
  }

  it('writes every record type, quoting and neutralising user text only', () => {
    const { snap, balances } = fixture();
    const csv = buildLedgerCsv(snap, balances, { exportedAt: '2026-10-22T12:00:00.000Z', timeZone: 'America/Toronto' });
    expect(csv.endsWith('\r\n')).toBe(true);
    const table = parseCsv(csv);
    expect(table[0]).toEqual([...LEDGER_CSV_HEADER]);
    const records = table.slice(1).map((cells) => Object.fromEntries(LEDGER_CSV_HEADER.map((h, i) => [h, cells[i] ?? ''])));
    for (const cells of table) expect(cells).toHaveLength(LEDGER_CSV_HEADER.length);

    expect(records.map((r) => r.record_type)).toEqual([
      'export_meta',
      'income',
      'income',
      'income',
      'adjustment',
      'opening_obligation',
      'church_payment',
      'payment_allocation',
      'set_aside_reserve',
      'summary_net_income',
      'summary_accrued',
      'summary_paid',
      'summary_still_to_give',
      'summary_credit',
      'summary_set_aside',
      'summary_net_income',
      'summary_accrued',
      'summary_paid',
      'summary_still_to_give',
      'summary_credit',
      'summary_set_aside',
    ]);
    const [meta, inc1, inc2, , adj, open, pay, alloc, sa] = records;
    expect(meta).toMatchObject({ reference: '2026-10-22T12:00:00.000Z', note: 'America/Toronto' });
    expect(inc1).toMatchObject({
      id: 'inc-1',
      date: '2026-10-03',
      currency: 'CAD',
      amount: '1750.00',
      amount_minor: '175000',
      tithe: '175.00',
      tithe_minor: '17500',
      tithe_rate_bps: '1000',
      rounding_policy: 'HALF_UP_PER_ENTRY_MINOR',
      source: `'=HYPERLINK("x")`,
      note: 'line1\nline2, "quoted"',
      bucket_year: '2026',
    });
    expect(inc2?.category).toBe("'@risk");
    expect(adj).toMatchObject({ linked_id: 'inc-2', amount: '-49.99', amount_minor: '-4999', tithe: '-5.00', category: 'refund', reason: "'-returned" });
    expect(open).toMatchObject({ amount: '20.00', tithe: '20.00', church_or_label: "'+old debt" });
    expect(pay).toMatchObject({ church_or_label: 'Grace, Downtown', reference: "'=1+2", amount: '60.00' });
    expect(alloc).toMatchObject({ linked_id: 'pay-1', bucket_year: '2026', amount: '60.00' });
    expect(sa).toMatchObject({ note: "'＝cmd", amount: '25.00' });
  });

  it('summary rows reconcile with the record rows and the balances', () => {
    const { snap, balances } = fixture();
    const table = parseCsv(buildLedgerCsv(snap, balances, { exportedAt: 'x', timeZone: 'UTC' }));
    const col = (name: (typeof LEDGER_CSV_HEADER)[number]) => LEDGER_CSV_HEADER.indexOf(name);
    for (const currency of ['CAD', 'USD'] as const) {
      const inCurrency = table.filter((r) => r[col('currency')] === currency);
      const sum = (types: string[], column: 'amount_minor' | 'tithe_minor') =>
        inCurrency.filter((r) => types.includes(r[col('record_type')] ?? '')).reduce((s, r) => s + Number(r[col(column)]), 0);
      const summary = (type: string) => Number(inCurrency.find((r) => r[col('record_type')] === type)?.[col('amount_minor')]);
      const accrued = sum(['income', 'adjustment', 'opening_obligation'], 'tithe_minor');
      const paid = sum(['church_payment'], 'amount_minor');
      expect(summary('summary_accrued')).toBe(accrued);
      expect(summary('summary_accrued')).toBe(balances[currency].accruedMinor);
      expect(summary('summary_paid')).toBe(paid);
      expect(summary('summary_net_income')).toBe(sum(['income', 'adjustment'], 'amount_minor'));
      expect(summary('summary_still_to_give') - summary('summary_credit')).toBe(accrued - paid);
    }
    // CAD: 175 + 25 - 5 + 20 = 215 accrued, paid 60 -> 155 still to give
    expect(balances.CAD.stillToGiveMinor).toBe(m('155.00'));
  });

  it('omits summaries for currencies without activity', () => {
    const snap = snapshot({ incomes: [income({ amount: '10.00', on: '2026-10-03' })] });
    const csv = buildLedgerCsv(snap, computeBalances(snap, trackingStart), { exportedAt: 'x', timeZone: 'UTC' });
    expect(csv).not.toContain(',USD,');
  });
});

describe('buildFilteredLedgerCsv', () => {
  it('exports the filtered rows with per-currency totals', () => {
    const snap = snapshot({
      incomes: [
        income({ amount: '249.99', on: '2026-10-04', id: 'inc-2', source: '-x' }),
        income({ amount: '100.00', on: '2026-10-05', id: 'inc-3', currency: 'USD' }),
      ],
      adjustments: [adjustment({ incomeId: 'inc-2', amount: '49.99', on: '2026-10-10' })],
    });
    const table = parseCsv(buildFilteredLedgerCsv(buildLedgerRows(snap)));
    expect(table[0]?.[0]).toBe('record_type');
    const cad = table.find((r) => r[1] === 'inc-2');
    expect(cad).toEqual(['income', 'inc-2', '2026-10-04', 'CAD', '249.99', '24999', '49.99', '4999', '200.00', '20000', '25.00', '2500', '20.00', '2000', "'-x", '', '']);
    const totals = table.filter((r) => r[0] === 'filtered_total');
    expect(totals.map((r) => [r[3], r[8], r[12], r[16]])).toEqual([
      ['CAD', '200.00', '20.00', '1 entries'],
      ['USD', '100.00', '10.00', '1 entries'],
    ]);
  });
});
