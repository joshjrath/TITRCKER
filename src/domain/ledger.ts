/**
 * Income ledger view models: each income with its adjustments, telescoping tithe deltas and net
 * figures, plus filtering, sorting and per-currency totals. Filtered totals describe the current
 * view only and are kept distinct from the all-time balance. Totals never mix currencies.
 */
import { CURRENCIES, type Currency } from './constants';
import type { LocalDate } from './dates';
import { addMinor, subMinor, sumMinor, ZERO, type Minor } from './money';
import { adjustmentsByIncome, type AdjustmentRecord, type IncomeRecord, type LedgerSnapshot } from './records';
import { compareByDateCreatedId, compareStrings } from './ordering';
import { adjustmentTitheDeltas, sortAdjustments } from './tithe';

export interface LedgerRow {
  income: IncomeRecord;
  /** Adjustments in canonical order, each with its derived tithe delta (<= 0). */
  adjustments: (AdjustmentRecord & { titheDeltaMinor: Minor })[];
  refundedMinor: Minor;
  netAmountMinor: Minor;
  netTitheMinor: Minor;
  refundableMinor: Minor;
}

/** Builds one row per active income, newest first (date_desc). */
export function buildLedgerRows(snapshot: LedgerSnapshot): LedgerRow[] {
  const grouped = adjustmentsByIncome(snapshot);
  const rows = snapshot.incomes.map((income): LedgerRow => {
    const adjustments = sortAdjustments(grouped.get(income.id) ?? []);
    const deltas = adjustmentTitheDeltas(income, adjustments);
    const withDeltas = adjustments.map((a) => ({ ...a, titheDeltaMinor: deltas.get(a.id) ?? ZERO }));
    const refunded = sumMinor(adjustments.map((a) => a.amountMinor));
    const netAmount = subMinor(income.amountMinor, refunded);
    return {
      income,
      adjustments: withDeltas,
      refundedMinor: refunded,
      netAmountMinor: netAmount,
      netTitheMinor: sumMinor([income.titheMinor, ...withDeltas.map((a) => a.titheDeltaMinor)]),
      refundableMinor: netAmount,
    };
  });
  return sortLedgerRows(rows, 'date_desc');
}

export type LedgerSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'source_asc';

export interface LedgerFilter {
  /** Case-insensitive substring match on source, category or note. */
  query?: string;
  /** Inclusive received-on bounds. */
  from?: LocalDate;
  to?: LocalDate;
  currency?: Currency | 'all';
}

/** Filters rows by text query, inclusive date range and currency. */
export function filterLedgerRows(rows: readonly LedgerRow[], filter: LedgerFilter): LedgerRow[] {
  const query = filter.query?.trim().toLowerCase() ?? '';
  return rows.filter(({ income }) => {
    if (filter.currency && filter.currency !== 'all' && income.currency !== filter.currency) return false;
    if (filter.from && income.receivedOn < filter.from) return false;
    if (filter.to && income.receivedOn > filter.to) return false;
    if (query === '') return true;
    return [income.source, income.category, income.note].some((text) => text?.toLowerCase().includes(query));
  });
}

const byDateAsc = (a: LedgerRow, b: LedgerRow): number =>
  compareByDateCreatedId(
    { date: a.income.receivedOn, createdAt: a.income.createdAt, id: a.income.id },
    { date: b.income.receivedOn, createdAt: b.income.createdAt, id: b.income.id },
  );

const SORTS: Record<LedgerSort, (a: LedgerRow, b: LedgerRow) => number> = {
  date_desc: (a, b) => byDateAsc(b, a),
  date_asc: byDateAsc,
  amount_desc: (a, b) => b.income.amountMinor - a.income.amountMinor || byDateAsc(b, a),
  amount_asc: (a, b) => a.income.amountMinor - b.income.amountMinor || byDateAsc(a, b),
  source_asc: (a, b) => {
    const sa = a.income.source?.toLowerCase() ?? null;
    const sb = b.income.source?.toLowerCase() ?? null;
    if (sa !== sb) {
      if (sa === null) return 1; // entries without a source sort last
      if (sb === null) return -1;
      return compareStrings(sa, sb);
    }
    return byDateAsc(b, a);
  },
};

/** Returns a sorted copy. Ties fall back to newest first so the order is always deterministic. */
export function sortLedgerRows(rows: readonly LedgerRow[], sort: LedgerSort): LedgerRow[] {
  return [...rows].sort(SORTS[sort]);
}

export interface LedgerTotals {
  count: number;
  grossMinor: Minor;
  refundedMinor: Minor;
  netMinor: Minor;
  /** Σ net tithe of the rows (after adjustments). */
  titheMinor: Minor;
}

/** Totals of the given rows, separately per currency (never mixed). */
export function totalsByCurrency(rows: readonly LedgerRow[]): Record<Currency, LedgerTotals> {
  const totals = {} as Record<Currency, LedgerTotals>;
  for (const currency of CURRENCIES) {
    totals[currency] = { count: 0, grossMinor: ZERO, refundedMinor: ZERO, netMinor: ZERO, titheMinor: ZERO };
  }
  for (const row of rows) {
    const t = totals[row.income.currency];
    t.count += 1;
    t.grossMinor = addMinor(t.grossMinor, row.income.amountMinor);
    t.refundedMinor = addMinor(t.refundedMinor, row.refundedMinor);
    t.netMinor = addMinor(t.netMinor, row.netAmountMinor);
    t.titheMinor = addMinor(t.titheMinor, row.netTitheMinor);
  }
  return totals;
}
