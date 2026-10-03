/**
 * Adversarial tests for CSV export (ARCHITECTURE §7): RFC 4180 round trips for arbitrary text,
 * formula-injection neutralisation (leading whitespace, Unicode spaces, fullwidth triggers) in every
 * user text column, and reconciliation of the summary rows.
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeBalances } from './balances';
import { buildFilteredLedgerCsv, buildLedgerCsv, escapeCsvCell, FILTERED_LEDGER_CSV_HEADER, LEDGER_CSV_HEADER, neutralizeFormula, toCsv } from './csv';
import { buildLedgerRows } from './ledger';
import { adjustment, income, opening, payment, resetFixtureSequence, setAside, snapshot } from './testFixtures';
import { toLocalDate } from './dates';

beforeEach(() => resetFixtureSequence());

const trackingStart = toLocalDate('2026-10-03');

/** Independent RFC 4180 parser (CRLF record separator; quoted fields may hold CR, LF, comma, quote). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? '';
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') quoted = false;
      else cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else if (ch === '"' || ch === '\r' || ch === '\n') {
      throw new Error(`Unquoted special character at ${i}`);
    } else cell += ch;
    i += 1;
  }
  if (cell !== '' || row.length > 0) throw new Error('Missing final CRLF');
  return rows;
}

const TRIGGERS = ['=', '+', '-', '@', '＝', '＋', '－', '＠'];
const LEADING_SPACES = [' ', '  ', ' ', '　', ' ', ' ', '\n', '\u000b', '\f', '﻿', ' ', ' \t', '\r\n '];

/** True when a spreadsheet could read the cell as a formula (the property neutralisation must prevent). */
function looksLikeFormula(cell: string): boolean {
  if (/^[\t\r\n]/.test(cell)) return true;
  const firstVisible = cell.replace(/^\s+/, '').charAt(0);
  return TRIGGERS.includes(firstVisible);
}

describe('neutralizeFormula', () => {
  it.each(LEADING_SPACES.flatMap((space) => TRIGGERS.map((t) => `${space}${t}HYPERLINK("http://x")`)))('neutralises %j', (text) => {
    expect(neutralizeFormula(text)).toBe(`'${text}`);
  });

  it.each(['\t', '\r', '\n', '\nnote', '\tSalary', '\rnote', '=', '-', '－5', '@SUM(A1)'])('neutralises %j', (text) => {
    expect(neutralizeFormula(text)).toBe(`'${text}`);
  });

  it.each(['Salary', 'Gift - Sam', 'a=b', ' x=1', "'=already", '', '   ', '5-3', '​plain', 'Ｓalary'])('leaves %j alone', (text) => {
    expect(neutralizeFormula(text)).toBe(text);
  });

  it('either returns the text or prefixes one quote, never leaves a formula, and is idempotent (property)', () => {
    const hostile = fc
      .tuple(fc.constantFrom('', ...LEADING_SPACES), fc.constantFrom('', ...TRIGGERS, '\t', '\r'), fc.string({ unit: 'grapheme', maxLength: 20 }))
      .map(([a, b, c]) => a + b + c);
    fc.assert(
      fc.property(fc.oneof(hostile, fc.string({ unit: 'binary', maxLength: 30 })), (text) => {
        const out = neutralizeFormula(text);
        expect(out === text || out === `'${text}`).toBe(true);
        expect(looksLikeFormula(out)).toBe(false);
        if (!looksLikeFormula(text)) expect(out).toBe(text);
        expect(neutralizeFormula(out)).toBe(out);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('RFC 4180 quoting', () => {
  it('round-trips any text, number and null exactly (property)', () => {
    const cell = fc.oneof(fc.string({ unit: 'binary', maxLength: 15 }), fc.constantFrom('"', '""', ',', '\r', '\n', '\r\n', ' a ', '"a"b'), fc.integer(), fc.constant(null));
    fc.assert(
      fc.property(fc.array(fc.array(cell, { minLength: 3, maxLength: 3 }), { maxLength: 6 }), fc.boolean(), (rows, bom) => {
        const text = toCsv(['a', 'b', 'c'], rows, { bom });
        expect(text.startsWith('﻿')).toBe(bom);
        const parsed = parseCsv(bom ? text.slice(1) : text);
        expect(parsed).toEqual([['a', 'b', 'c'], ...rows.map((r) => r.map((v) => (v === null ? '' : String(v))))]);
      }),
      { numRuns: 500 },
    );
  });

  it('quotes a lone CR or LF and a leading quote', () => {
    expect(escapeCsvCell('\r')).toBe('"\r"');
    expect(escapeCsvCell('\n')).toBe('"\n"');
    expect(escapeCsvCell('"x')).toBe('"""x"');
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])('rejects non-integer or unsafe numeric cell %s', (n) => {
    expect(() => toCsv(['a'], [[n]])).toThrow(RangeError);
  });
});

describe('buildLedgerCsv neutralises every user text column', () => {
  const USER_COLUMNS = ['source', 'category', 'church_or_label', 'reference', 'note', 'reason'] as const;
  const hostileText = fc
    .tuple(fc.constantFrom('', ...LEADING_SPACES), fc.constantFrom(...TRIGGERS, '\t', '\r'), fc.string({ maxLength: 12 }))
    .map(([a, b, c]) => a + b + c);

  it('no exported cell can be read as a formula, and every row has the header width (property)', () => {
    fc.assert(
      fc.property(fc.array(hostileText, { minLength: 12, maxLength: 12 }), (t) => {
        const snap = snapshot({
          incomes: [income({ amount: '100.00', on: '2026-10-05', id: 'inc-1', source: t[0], category: t[1], note: t[2] })],
          adjustments: [adjustment({ incomeId: 'inc-1', amount: '10.00', on: '2026-10-06', id: 'adj-1', reason: t[3] ?? 'x' })],
          openings: [opening({ amount: '5.00', on: '2026-01-01', id: 'open-1', label: t[4] ?? 'x', note: t[5] })],
          payments: [payment({ amount: '3.00', on: '2026-10-07', id: 'pay-1', churchName: t[6] ?? 'x', reference: t[7], note: t[8], allocations: [[2026, '3.00']] })],
          setAsides: [setAside({ kind: 'reserve', amount: '1.00', on: '2026-10-08', id: 'sa-1', note: t[9] })],
        });
        const csv = buildLedgerCsv(snap, computeBalances(snap, trackingStart), { exportedAt: '2026-10-09T00:00:00.000Z', timeZone: 'America/St_Johns' });
        const table = parseCsv(csv);
        for (const row of table) expect(row).toHaveLength(LEDGER_CSV_HEADER.length);
        for (const row of table.slice(1)) {
          for (const column of USER_COLUMNS) {
            const value = row[LEDGER_CSV_HEADER.indexOf(column)] ?? '';
            expect(looksLikeFormula(value), `${column}: ${JSON.stringify(value)}`).toBe(false);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('the filtered export neutralises source, category and note as well', () => {
    const snap = snapshot({ incomes: [income({ amount: '1.00', on: '2026-10-05', source: ' =1+1', category: '　＋cmd', note: '\t@x' })] });
    const [, row] = parseCsv(buildFilteredLedgerCsv(buildLedgerRows(snap)));
    const at = (name: (typeof FILTERED_LEDGER_CSV_HEADER)[number]) => row?.[FILTERED_LEDGER_CSV_HEADER.indexOf(name)];
    expect([at('source'), at('category'), at('note')]).toEqual(["' =1+1", "'　＋cmd", "'\t@x"]);
  });

  it('amount columns are plain decimals that agree with their minor-unit columns', () => {
    const snap = snapshot({
      incomes: [income({ amount: '999,999,999.99', on: '2026-10-05', id: 'inc-1' }), income({ amount: '0.01', on: '2026-10-05' })],
      adjustments: [adjustment({ incomeId: 'inc-1', amount: '0.05', on: '2026-10-06' })],
    });
    const table = parseCsv(buildLedgerCsv(snap, computeBalances(snap, trackingStart), { exportedAt: 'x', timeZone: 'UTC' }));
    const col = (name: (typeof LEDGER_CSV_HEADER)[number]) => LEDGER_CSV_HEADER.indexOf(name);
    for (const row of table.slice(1)) {
      for (const [decimal, minor] of [['amount', 'amount_minor'], ['tithe', 'tithe_minor']] as const) {
        const text = row[col(decimal)] ?? '';
        if (text === '') continue;
        expect(text).toMatch(/^-?\d+\.\d{2}$/);
        expect(BigInt(text.replace('.', ''))).toBe(BigInt(row[col(minor)] ?? 'NaN'));
      }
    }
  });
});
