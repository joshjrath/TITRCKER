/**
 * CSV export (RFC 4180) with spreadsheet formula-injection neutralisation.
 *
 * - Cells containing a comma, double quote, CR or LF are wrapped in double quotes; inner quotes doubled.
 * - Rows end with CRLF. An optional UTF-8 BOM helps spreadsheet apps detect the encoding.
 * - User-supplied text fields (source, category, note, church name / label, reference, reason) pass
 *   through {@link neutralizeFormula}. System fields (ids, dates, currency codes, policy names) and
 *   numeric fields are written plain, so amounts stay machine-readable decimals.
 * - Exports keep every original currency and end with per-currency summary rows that reconcile
 *   with the balances: Σ tithe column (income + adjustment + opening rows) = summary_accrued, etc.
 */
import { CURRENCIES, type Currency } from './constants';
import { yearOf } from './dates';
import { minorToDecimalString, negMinor, sumMinor, type Minor } from './money';
import type { CurrencyBalance } from './balances';
import { buildLedgerRows, type LedgerRow } from './ledger';
import type { LedgerSnapshot } from './records';
import { compareSetAside } from './setAside';
import { compareByDateCreatedId } from './ordering';

const CSV_NEEDS_QUOTING = /[",\r\n]/;
/** Leading characters that make spreadsheets evaluate a cell (ASCII and fullwidth forms). */
const FORMULA_TRIGGER = /^[=+\-@＝＋－＠]/;
const CONTROL_TRIGGER = /^[\t\r\n]/;
const LEADING_WHITESPACE = /^\s+/;
const UTF8_BOM = '﻿';
const CRLF = '\r\n';

/** RFC 4180 quoting for a single cell. */
export function escapeCsvCell(value: string): string {
  return CSV_NEEDS_QUOTING.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Prefixes `'` when a user text would be evaluated as a formula: it starts with tab or CR, or its
 * first non-whitespace character is = + - @ (or the fullwidth ＝ ＋ － ＠).
 */
export function neutralizeFormula(text: string): string {
  if (CONTROL_TRIGGER.test(text) || FORMULA_TRIGGER.test(text.replace(LEADING_WHITESPACE, ''))) {
    return `'${text}`;
  }
  return text;
}

export type CsvCell = string | number | null;

function cellText(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new RangeError(`CSV numeric cells must be integers, got ${value}`);
    return String(value);
  }
  return value;
}

/**
 * Serialises a header and rows as CSV with CRLF line endings (including after the last row).
 * Numbers must be integers (minor units, years, rates); decimals should be passed as strings.
 * Does not neutralise formulas — callers neutralise user text fields explicitly.
 */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly CsvCell[])[],
  opts: { bom?: boolean } = {},
): string {
  const lines = [header, ...rows].map((row) => row.map((cell) => escapeCsvCell(cellText(cell))).join(','));
  return `${opts.bom ? UTF8_BOM : ''}${lines.join(CRLF)}${CRLF}`;
}

export const LEDGER_CSV_HEADER = [
  'record_type',
  'id',
  'linked_id',
  'date',
  'currency',
  'amount',
  'amount_minor',
  'tithe',
  'tithe_minor',
  'tithe_rate_bps',
  'rounding_policy',
  'source',
  'category',
  'church_or_label',
  'reference',
  'note',
  'reason',
  'bucket_year',
] as const;

type LedgerCsvColumn = (typeof LEDGER_CSV_HEADER)[number];
type LedgerCsvRow = Partial<Record<LedgerCsvColumn, CsvCell>>;

/** Neutralises an optional user text field. */
const userText = (text: string | null | undefined): string | null =>
  text === null || text === undefined ? null : neutralizeFormula(text);

const money = (minor: Minor): { decimal: string; minor: number } => ({ decimal: minorToDecimalString(minor), minor });

function amountCells(minor: Minor): LedgerCsvRow {
  const m = money(minor);
  return { amount: m.decimal, amount_minor: m.minor };
}

function titheCells(minor: Minor): LedgerCsvRow {
  const m = money(minor);
  return { tithe: m.decimal, tithe_minor: m.minor };
}

function toRowArray(row: LedgerCsvRow): CsvCell[] {
  return LEDGER_CSV_HEADER.map((column) => row[column] ?? null);
}

function summaryRows(balances: Record<Currency, CurrencyBalance>): LedgerCsvRow[] {
  const rows: LedgerCsvRow[] = [];
  for (const currency of CURRENCIES) {
    const b = balances[currency];
    if (!b.hasActivity) continue;
    const summaries: [string, Minor][] = [
      ['summary_net_income', b.netIncomeMinor],
      ['summary_accrued', b.accruedMinor],
      ['summary_paid', b.paidMinor],
      ['summary_still_to_give', b.stillToGiveMinor],
      ['summary_credit', b.creditMinor],
      ['summary_set_aside', b.setAsideMinor],
    ];
    for (const [recordType, minor] of summaries) rows.push({ record_type: recordType, currency, ...amountCells(minor) });
  }
  return rows;
}

/**
 * Full reconciliation export. Row order: export_meta, incomes (date order), adjustments (amount and
 * tithe delta negative; category = refund|correction), opening obligations (tithe = obligation),
 * church payments each followed by their allocations, set-aside reserves/releases, then summary rows
 * per currency with activity: summary_net_income, summary_accrued, summary_paid,
 * summary_still_to_give, summary_credit, summary_set_aside.
 * The export_meta row carries `exportedAt` in `reference` and the time zone in `note`.
 */
export function buildLedgerCsv(
  snapshot: LedgerSnapshot,
  balances: Record<Currency, CurrencyBalance>,
  meta: { exportedAt: string; timeZone: string },
  opts: { bom?: boolean } = {},
): string {
  // The time zone is owner-chosen text: neutralise it like any other user field (defence in depth).
  const rows: LedgerCsvRow[] = [{ record_type: 'export_meta', reference: meta.exportedAt, note: userText(meta.timeZone) }];
  const ledgerRows = buildLedgerRows(snapshot).reverse();

  for (const { income } of ledgerRows) {
    rows.push({
      record_type: 'income',
      id: income.id,
      date: income.receivedOn,
      currency: income.currency,
      ...amountCells(income.amountMinor),
      ...titheCells(income.titheMinor),
      tithe_rate_bps: income.titheRateBps,
      rounding_policy: income.roundingPolicy,
      source: userText(income.source),
      category: userText(income.category),
      note: userText(income.note),
      bucket_year: yearOf(income.receivedOn),
    });
  }
  for (const { income, adjustments } of ledgerRows) {
    for (const adjustment of adjustments) {
      rows.push({
        record_type: 'adjustment',
        id: adjustment.id,
        linked_id: income.id,
        date: adjustment.effectiveOn,
        currency: income.currency,
        ...amountCells(negMinor(adjustment.amountMinor)),
        ...titheCells(adjustment.titheDeltaMinor),
        tithe_rate_bps: income.titheRateBps,
        rounding_policy: income.roundingPolicy,
        category: adjustment.kind,
        reason: userText(adjustment.reason),
        bucket_year: yearOf(adjustment.effectiveOn),
      });
    }
  }
  const openings = [...snapshot.openings].sort((a, b) =>
    compareByDateCreatedId({ ...a, date: a.effectiveOn }, { ...b, date: b.effectiveOn }),
  );
  for (const opening of openings) {
    rows.push({
      record_type: 'opening_obligation',
      id: opening.id,
      date: opening.effectiveOn,
      currency: opening.currency,
      ...amountCells(opening.amountMinor),
      ...titheCells(opening.amountMinor),
      church_or_label: userText(opening.label),
      note: userText(opening.note),
      bucket_year: yearOf(opening.effectiveOn),
    });
  }
  const payments = [...snapshot.payments].sort((a, b) =>
    compareByDateCreatedId({ ...a, date: a.paidOn }, { ...b, date: b.paidOn }),
  );
  for (const payment of payments) {
    rows.push({
      record_type: 'church_payment',
      id: payment.id,
      date: payment.paidOn,
      currency: payment.currency,
      ...amountCells(payment.amountMinor),
      church_or_label: userText(payment.churchName),
      reference: userText(payment.reference),
      note: userText(payment.note),
    });
    for (const allocation of [...payment.allocations].sort((a, b) => a.bucketYear - b.bucketYear)) {
      rows.push({
        record_type: 'payment_allocation',
        linked_id: payment.id,
        date: payment.paidOn,
        currency: payment.currency,
        ...amountCells(allocation.amountMinor),
        bucket_year: allocation.bucketYear,
      });
    }
  }
  for (const entry of [...snapshot.setAsides].sort(compareSetAside)) {
    rows.push({
      record_type: entry.kind === 'reserve' ? 'set_aside_reserve' : 'set_aside_release',
      id: entry.id,
      linked_id: entry.paymentId,
      date: entry.effectiveOn,
      currency: entry.currency,
      ...amountCells(entry.amountMinor),
      note: userText(entry.note),
    });
  }
  rows.push(...summaryRows(balances));
  return toCsv(LEDGER_CSV_HEADER, rows.map(toRowArray), opts);
}

export const FILTERED_LEDGER_CSV_HEADER = [
  'record_type',
  'id',
  'date',
  'currency',
  'amount',
  'amount_minor',
  'refunded',
  'refunded_minor',
  'net_amount',
  'net_amount_minor',
  'tithe',
  'tithe_minor',
  'net_tithe',
  'net_tithe_minor',
  'source',
  'category',
  'note',
] as const;

/**
 * Export of the currently filtered ledger view: one `income` row per entry, followed by a
 * `filtered_total` row per currency present in the view. Amounts never mix currencies.
 */
export function buildFilteredLedgerCsv(rows: readonly LedgerRow[], opts: { bom?: boolean } = {}): string {
  const out: CsvCell[][] = rows.map(({ income, refundedMinor, netAmountMinor, netTitheMinor }) => [
    'income',
    income.id,
    income.receivedOn,
    income.currency,
    minorToDecimalString(income.amountMinor),
    income.amountMinor,
    minorToDecimalString(refundedMinor),
    refundedMinor,
    minorToDecimalString(netAmountMinor),
    netAmountMinor,
    minorToDecimalString(income.titheMinor),
    income.titheMinor,
    minorToDecimalString(netTitheMinor),
    netTitheMinor,
    userText(income.source),
    userText(income.category),
    userText(income.note),
  ]);
  for (const currency of CURRENCIES) {
    const inCurrency = rows.filter((r) => r.income.currency === currency);
    if (inCurrency.length === 0) continue;
    const total = (pick: (r: LedgerRow) => Minor): Minor => sumMinor(inCurrency.map(pick));
    const gross = total((r) => r.income.amountMinor);
    const refunded = total((r) => r.refundedMinor);
    const net = total((r) => r.netAmountMinor);
    const tithe = total((r) => r.income.titheMinor);
    const netTithe = total((r) => r.netTitheMinor);
    out.push([
      'filtered_total',
      null,
      null,
      currency,
      minorToDecimalString(gross),
      gross,
      minorToDecimalString(refunded),
      refunded,
      minorToDecimalString(net),
      net,
      minorToDecimalString(tithe),
      tithe,
      minorToDecimalString(netTithe),
      netTithe,
      null,
      null,
      `${inCurrency.length} entries`,
    ]);
  }
  return toCsv(FILTERED_LEDGER_CSV_HEADER, out, opts);
}
