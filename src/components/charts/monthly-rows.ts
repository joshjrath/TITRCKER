import { formatLocalDate, formatMonthKey, toLocalDate } from '@/domain';

/** The money columns of a monthly breakdown row (structural subset of the domain `MonthRowValues`). */
export interface MonthlyCells {
  netIncomeMinor: number;
  titheMinor: number;
  paidMinor: number;
}

/**
 * Structural subset of the domain `MonthRow`: a calendar month, or a row for period amounts dated before the range
 * start (`before`, e.g. an opening balance) or after its end (`after`, e.g. a payment for this year made in January).
 * `kind` defaults to `month`.
 */
export type MonthlyBreakdownRow = MonthlyCells & { monthKey: string } & (
    | { kind?: 'month' }
    | { kind: 'before' | 'after'; date: string }
  );

export interface MonthlyRowLabel {
  /** Short visible label: "Oct", "Oct ’26", "Before Oct 3", "After Dec 31". */
  text: string;
  /** Small second line for before/after rows: "Opening balance", "Given earlier", "Given later". */
  detail?: string;
  /** Full label for assistive tech: "October 2026", "Before October 3, 2026: opening balance". */
  spoken: string;
}

/** Stable React key for a row. */
export function monthlyRowKey(row: MonthlyBreakdownRow): string {
  return row.kind === 'before' || row.kind === 'after' ? row.kind : row.monthKey;
}

/** Labels for one breakdown row. `multiYear` adds the year to month labels ("Oct ’26"). */
export function monthlyRowLabel(row: MonthlyBreakdownRow, multiYear: boolean): MonthlyRowLabel {
  if (row.kind === 'before' || row.kind === 'after') {
    const before = row.kind === 'before';
    const detail = before ? (row.titheMinor !== 0 ? 'Opening balance' : 'Given earlier') : 'Given later';
    const word = before ? 'Before' : 'After';
    const date = toLocalDate(row.date);
    return {
      text: `${word} ${formatLocalDate(date, 'short')}`,
      detail,
      spoken: `${word} ${formatLocalDate(date, 'medium')}: ${detail.toLowerCase()}`,
    };
  }
  const short = formatMonthKey(row.monthKey, 'short');
  return {
    text: multiYear ? `${short} ’${row.monthKey.slice(2, 4)}` : short,
    spoken: formatMonthKey(row.monthKey, 'long'),
  };
}

/** True when the month rows span more than one calendar year (all time). */
export function spansYears(rows: readonly MonthlyBreakdownRow[]): boolean {
  const years = new Set(rows.flatMap((r) => (r.kind === 'before' || r.kind === 'after' ? [] : [r.monthKey.slice(0, 4)])));
  return years.size > 1;
}
