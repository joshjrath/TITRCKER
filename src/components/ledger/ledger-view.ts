import {
  CURRENCIES,
  ROUNDING_POLICY,
  buildFilteredLedgerCsv,
  filterLedgerRows,
  parseLocalDate,
  sortLedgerRows,
  totalsByCurrency,
  type Currency,
  type LedgerFilter,
  type LedgerRow,
  type LedgerSort,
  type LedgerTotals,
} from "@/domain";
import type { IncomeRowVM } from "@/lib/view-models";

/** The domain sorts plus "Source Z–A". */
export type LedgerSortKey = LedgerSort | "source_desc";

/** Client-only view state of the ledger (never put in the URL: it can hold search text). */
export interface LedgerViewState {
  query: string;
  /** Raw date input values ('' = no bound). */
  from: string;
  to: string;
  currency: Currency | "all";
  sort: LedgerSortKey;
}

export const DEFAULT_LEDGER_VIEW: LedgerViewState = { query: "", from: "", to: "", currency: "all", sort: "date_desc" };

export const SORT_OPTIONS: readonly { value: LedgerSortKey; label: string }[] = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "amount_desc", label: "Largest amount" },
  { value: "amount_asc", label: "Smallest amount" },
  { value: "source_asc", label: "Source A–Z" },
  { value: "source_desc", label: "Source Z–A" },
];

/** The domain ledger row for a view-model row, so the domain filters, sorts, totals and CSV can run on it. */
export function toLedgerRow(row: IncomeRowVM): LedgerRow {
  return {
    income: {
      id: row.id,
      currency: row.currency,
      amountMinor: row.amountMinor,
      receivedOn: row.receivedOn,
      titheRateBps: row.titheRateBps,
      roundingPolicy: ROUNDING_POLICY,
      titheMinor: row.titheMinor,
      source: row.source,
      category: row.category,
      note: row.note,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
    },
    adjustments: row.adjustments.map((a) => ({
      id: a.id,
      incomeId: row.id,
      kind: a.kind,
      amountMinor: a.amountMinor,
      effectiveOn: a.effectiveOn,
      reason: a.reason,
      createdAt: a.createdAt,
      titheDeltaMinor: a.titheDeltaMinor,
    })),
    refundedMinor: row.refundedMinor,
    netAmountMinor: row.netAmountMinor,
    netTitheMinor: row.netTitheMinor,
    refundableMinor: row.refundableMinor,
  };
}

/**
 * Source Z–A: the domain's A–Z order with the source groups reversed. Entries without a source stay last and
 * each source keeps the domain's newest-first tie-break, exactly as in A–Z.
 */
function sortSourceDesc(rows: readonly LedgerRow[]): LedgerRow[] {
  const ascending = sortLedgerRows(rows, "source_asc");
  const groups: LedgerRow[][] = [];
  const unnamed: LedgerRow[] = [];
  let currentKey: string | null = null;
  for (const row of ascending) {
    const source = row.income.source;
    if (source === null) {
      unnamed.push(row);
      continue;
    }
    const key = source.toLowerCase();
    if (key !== currentKey || groups.length === 0) {
      groups.push([]);
      currentKey = key;
    }
    groups[groups.length - 1]?.push(row);
  }
  return [...groups.reverse().flat(), ...unnamed];
}

export function sortRows(rows: readonly LedgerRow[], sort: LedgerSortKey): LedgerRow[] {
  return sort === "source_desc" ? sortSourceDesc(rows) : sortLedgerRows(rows, sort);
}

/** The date bounds in effect: unparsable input is ignored; `inverted` when From is after To. */
export function dateBounds(view: Pick<LedgerViewState, "from" | "to">): {
  from?: LedgerFilter["from"];
  to?: LedgerFilter["to"];
  inverted: boolean;
} {
  const from = parseLocalDate(view.from) ?? undefined;
  const to = parseLocalDate(view.to) ?? undefined;
  return { from, to, inverted: Boolean(from && to && from > to) };
}

export interface LedgerSelection {
  /** View-model rows in display order. */
  rows: IncomeRowVM[];
  /** The same rows as domain rows (for totals and the filtered CSV). */
  ledgerRows: LedgerRow[];
}

/** Filters and sorts with the domain helpers, then maps back to the view-model rows. */
export function selectRows(all: readonly IncomeRowVM[], view: LedgerViewState): LedgerSelection {
  const byId = new Map(all.map((row) => [row.id, row]));
  const { from, to } = dateBounds(view);
  const filtered = filterLedgerRows(all.map(toLedgerRow), { query: view.query, from, to, currency: view.currency });
  const ledgerRows = sortRows(filtered, view.sort);
  const rows = ledgerRows.map((r) => byId.get(r.income.id)).filter((r): r is IncomeRowVM => r !== undefined);
  return { rows, ledgerRows };
}

/** True when any filter (not the sort) narrows the ledger. */
export function hasActiveFilters(view: LedgerViewState): boolean {
  return view.query.trim() !== "" || view.from !== "" || view.to !== "" || view.currency !== "all";
}

export type CurrencyTotals = LedgerTotals & { currency: Currency };

/** Totals of the selection per currency that has entries in it (never mixed). */
export function selectionTotals(ledgerRows: readonly LedgerRow[]): CurrencyTotals[] {
  const totals = totalsByCurrency(ledgerRows);
  return CURRENCIES.filter((c) => totals[c].count > 0).map((currency) => ({ currency, ...totals[currency] }));
}

export function entryCountText(count: number): string {
  return count === 1 ? "1 entry" : `${count} entries`;
}

/** Filename of the filtered export, dated in the owner's time zone. */
export function filteredCsvFilename(today: string): string {
  return `tenth-ledger-filtered-${today}.csv`;
}

/** The filtered view as CSV (domain builder, with a BOM for spreadsheet apps like the full export). */
export function filteredCsv(ledgerRows: readonly LedgerRow[]): string {
  return buildFilteredLedgerCsv(ledgerRows, { bom: true });
}
