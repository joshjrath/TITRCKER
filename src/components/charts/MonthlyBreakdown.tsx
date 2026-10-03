import type { ReactNode } from 'react';
import { sumMinor, toMinor, type Currency } from '@/domain';
import { formatMinorDisplay } from './scale';
import styles from './charts.module.css';
import { barFractions } from './bars';
import { monthlyRowKey, monthlyRowLabel, spansYears, type MonthlyBreakdownRow } from './monthly-rows';

export type { MonthlyBreakdownRow } from './monthly-rows';

export interface MonthlyBreakdownProps {
  rows: readonly MonthlyBreakdownRow[];
  currency: Currency;
  /** Range label, e.g. "Oct 3 – Dec 31, 2026". */
  rangeLabel: string;
  /** Default "Monthly breakdown". */
  title?: string;
  /** Heading level for the title. Default 3. */
  headingLevel?: 2 | 3 | 4;
  /** Totals row. Default true when there is more than one month. */
  showTotals?: boolean;
  emptyMessage?: ReactNode;
  /** Small explanatory line under the table, e.g. what the Given column counts. */
  note?: ReactNode;
  className?: string;
}

/** Longest figure ("100,000.00") that fits the fixed money columns at phone width. */
const LONG_FIGURE_CHARS = 10;

function Value({ minor }: { minor: number }) {
  return (
    <span className={[styles.cellValue, minor === 0 ? styles.zero : ''].join(' ')}>{formatMinorDisplay(minor)}</span>
  );
}

function Bar({ fraction, kind }: { fraction: number; kind: 'tithe' | 'paid' }) {
  return (
    <svg className={styles.bar} aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="100%" height="3" rx="1.5" className={styles.barTrack} />
      {fraction > 0 && (
        <rect
          x="0"
          y="0"
          width={`${Math.max(1.5, Math.round(fraction * 1000) / 10)}%`}
          height="3"
          rx="1.5"
          className={kind === 'tithe' ? styles.barTithe : styles.barPaid}
        />
      )}
    </svg>
  );
}

/** A keyboard-reachable sideways-scrolling region around the table, only when its figures are long. */
function ScrollWhenLong({ long, label, children }: { long: boolean; label: string; children: ReactNode }) {
  if (!long) return <>{children}</>;
  return (
    <div className={styles.monthlyScroll} role="region" aria-label={`${label} (scrolls sideways)`} tabIndex={0}>
      {children}
    </div>
  );
}

/**
 * Compact monthly rows (month, income, tithe, given). Tithe and given each carry a slim bar under the
 * figure; both bars share one scale and equal column widths so their lengths compare directly.
 * Period amounts dated outside the range (an opening balance before the tracking start, a payment for this
 * year made in January) get their own "Before …" / "After …" rows, so the totals match the period figures.
 * A real table: the bars are decorative and every value is in the text.
 */
export function MonthlyBreakdown({
  rows,
  currency,
  rangeLabel,
  title = 'Monthly breakdown',
  headingLevel = 3,
  showTotals,
  emptyMessage = 'No months in this period yet.',
  note,
  className,
}: MonthlyBreakdownProps) {
  const Heading = `h${headingLevel}` as const;
  const multiYear = spansYears(rows);
  const fractions = barFractions(rows);
  const totals = showTotals ?? rows.length > 1;
  const sum = (pick: (r: MonthlyBreakdownRow) => number) => sumMinor(rows.map((r) => toMinor(pick(r))));
  // Figures wider than the fixed columns allow (from about 1,000,000.00) switch to an auto layout inside a
  // sideways-scrolling region, so digits never overlap or get clipped.
  const totalsRow = {
    netIncomeMinor: sum((r) => r.netIncomeMinor),
    titheMinor: sum((r) => r.titheMinor),
    paidMinor: sum((r) => r.paidMinor),
  };
  const long = [...rows, totalsRow]
    .flatMap((r) => [r.netIncomeMinor, r.titheMinor, r.paidMinor])
    .some((v) => formatMinorDisplay(v).length > LONG_FIGURE_CHARS);

  return (
    <div className={[styles.viz, styles.monthly, className].filter(Boolean).join(' ')}>
      {rows.length === 0 ? (
        <>
          <Heading className={styles.chartTitle}>{title}</Heading>
          <p className={styles.chartMeta}>
            {currency} · {rangeLabel}
          </p>
          <p className={styles.monthlyEmpty}>{emptyMessage}</p>
        </>
      ) : (
        <ScrollWhenLong long={long} label={title}>
          <table className={[styles.monthlyTable, long ? styles.monthlyTableLong : ''].filter(Boolean).join(' ')}>
            <caption>
              <Heading className={styles.chartTitle}>{title}</Heading>
              <span className={styles.chartMeta}>
                {currency} · {rangeLabel}
              </span>
            </caption>
            <colgroup>
              <col className={styles.colMonth} />
              <col className={styles.colMoney} />
              <col className={styles.colMoney} />
              <col className={styles.colMoney} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">
                  Income<span className={styles.srOnly}> ({currency})</span>
                </th>
                <th scope="col">
                  Tithe<span className={styles.srOnly}> ({currency})</span>
                </th>
                <th scope="col">
                  Given<span className={styles.srOnly}> ({currency})</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const f = fractions[i] ?? { tithe: 0, paid: 0 };
                const label = monthlyRowLabel(r, multiYear);
                return (
                  <tr key={monthlyRowKey(r)}>
                    <th scope="row">
                      <span aria-hidden="true">{label.text}</span>
                      {label.detail ? (
                        <span aria-hidden="true" className={styles.rowDetail}>
                          {label.detail}
                        </span>
                      ) : null}
                      <span className={styles.srOnly}>{label.spoken}</span>
                    </th>
                    <td>
                      <Value minor={r.netIncomeMinor} />
                    </td>
                    <td>
                      <Value minor={r.titheMinor} />
                      <Bar fraction={f.tithe} kind="tithe" />
                    </td>
                    <td>
                      <Value minor={r.paidMinor} />
                      <Bar fraction={f.paid} kind="paid" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {totals && (
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td>
                    <Value minor={totalsRow.netIncomeMinor} />
                  </td>
                  <td>
                    <Value minor={totalsRow.titheMinor} />
                  </td>
                  <td>
                    <Value minor={totalsRow.paidMinor} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </ScrollWhenLong>
      )}
      {note && rows.length > 0 ? <p className={styles.monthlyNote}>{note}</p> : null}
    </div>
  );
}
