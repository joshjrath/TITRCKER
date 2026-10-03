import type { ReactNode } from 'react';
import { formatMonthKey, sumMinor, toMinor, type Currency } from '@/domain';
import { formatMinorDisplay } from './scale';
import styles from './charts.module.css';
import { barFractions } from './bars';

/** Structural subset of the domain `MonthRow`. */
export interface MonthlyBreakdownRow {
  monthKey: string;
  netIncomeMinor: number;
  titheMinor: number;
  paidMinor: number;
}

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
  className?: string;
}

function Value({ minor }: { minor: number }) {
  return <span className={[styles.cellValue, minor === 0 ? styles.zero : ''].join(' ')}>{formatMinorDisplay(minor)}</span>;
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

/**
 * Compact monthly rows (month, income, tithe, paid). Tithe and paid each carry a slim bar under the
 * figure; both bars share one scale and equal column widths so their lengths compare directly.
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
  className,
}: MonthlyBreakdownProps) {
  const Heading = `h${headingLevel}` as const;
  const multiYear = new Set(rows.map((r) => r.monthKey.slice(0, 4))).size > 1;
  const fractions = barFractions(rows);
  const totals = showTotals ?? rows.length > 1;
  const sum = (pick: (r: MonthlyBreakdownRow) => number) => sumMinor(rows.map((r) => toMinor(pick(r))));

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
        <table className={styles.monthlyTable}>
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
                Paid<span className={styles.srOnly}> ({currency})</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const f = fractions[i] ?? { tithe: 0, paid: 0 };
              const short = formatMonthKey(r.monthKey, 'short');
              return (
                <tr key={r.monthKey}>
                  <th scope="row">
                    <span aria-hidden="true">{multiYear ? `${short} ’${r.monthKey.slice(2, 4)}` : short}</span>
                    <span className={styles.srOnly}>{formatMonthKey(r.monthKey, 'long')}</span>
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
                  <Value minor={sum((r) => r.netIncomeMinor)} />
                </td>
                <td>
                  <Value minor={sum((r) => r.titheMinor)} />
                </td>
                <td>
                  <Value minor={sum((r) => r.paidMinor)} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}
