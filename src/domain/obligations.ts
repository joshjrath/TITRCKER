/**
 * Obligation events: every signed change to what is owed (ARCHITECTURE §3.5).
 *
 * - An income entry's tithe: positive, dated `receivedOn`.
 * - An adjustment's telescoping tithe delta: zero or negative, dated `effectiveOn`.
 * - An opening obligation (debt from before recorded history): positive, dated `effectiveOn`.
 *   It is never counted as income.
 *
 * Each event belongs to the bucket `(currency, calendar year of its date)`.
 */
import type { Currency } from './constants';
import { yearOf, type LocalDate } from './dates';
import type { Minor } from './money';
import { adjustmentsByIncome, type LedgerSnapshot } from './records';
import { compareByDateCreatedId, compareStrings } from './ordering';
import { adjustmentTitheDeltas } from './tithe';

export type ObligationSource = 'income' | 'refund' | 'opening';

export interface ObligationEvent {
  currency: Currency;
  date: LocalDate;
  bucketYear: number;
  /** Signed: income and opening are >= 0, refund deltas are <= 0. */
  amountMinor: Minor;
  source: ObligationSource;
  sourceId: string;
  /** Set for income and refund events. */
  incomeId?: string;
  /** Creation timestamp of the underlying record (used for deterministic ordering). */
  createdAt: string;
}

const SOURCE_ORDER: Record<ObligationSource, number> = { income: 0, refund: 1, opening: 2 };

/** Deterministic event order: date, createdAt, sourceId, then source kind. */
export function compareObligationEvents(a: ObligationEvent, b: ObligationEvent): number {
  return (
    compareByDateCreatedId(
      { date: a.date, createdAt: a.createdAt, id: a.sourceId },
      { date: b.date, createdAt: b.createdAt, id: b.sourceId },
    ) ||
    SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] ||
    compareStrings(a.currency, b.currency)
  );
}

/**
 * Derives every obligation event from the active records, in deterministic order
 * (date, then createdAt, then id). Refund deltas are computed per income in canonical adjustment
 * order and dated on the adjustment's effective date, so they land in that date's bucket.
 * @throws RangeError when an income's adjustments exceed its amount or its stored tithe is wrong.
 */
export function deriveObligationEvents(snapshot: LedgerSnapshot): ObligationEvent[] {
  const events: ObligationEvent[] = [];
  const grouped = adjustmentsByIncome(snapshot);

  for (const income of snapshot.incomes) {
    events.push({
      currency: income.currency,
      date: income.receivedOn,
      bucketYear: yearOf(income.receivedOn),
      amountMinor: income.titheMinor,
      source: 'income',
      sourceId: income.id,
      incomeId: income.id,
      createdAt: income.createdAt,
    });
    const adjustments = grouped.get(income.id) ?? [];
    const deltas = adjustmentTitheDeltas(income, adjustments);
    for (const adjustment of adjustments) {
      const delta = deltas.get(adjustment.id);
      if (delta === undefined) continue;
      events.push({
        currency: income.currency,
        date: adjustment.effectiveOn,
        bucketYear: yearOf(adjustment.effectiveOn),
        amountMinor: delta,
        source: 'refund',
        sourceId: adjustment.id,
        incomeId: income.id,
        createdAt: adjustment.createdAt,
      });
    }
  }

  for (const opening of snapshot.openings) {
    events.push({
      currency: opening.currency,
      date: opening.effectiveOn,
      bucketYear: yearOf(opening.effectiveOn),
      amountMinor: opening.amountMinor,
      source: 'opening',
      sourceId: opening.id,
      createdAt: opening.createdAt,
    });
  }

  return events.sort(compareObligationEvents);
}

/** Events of one currency (order preserved). */
export function eventsForCurrency(events: readonly ObligationEvent[], currency: Currency): ObligationEvent[] {
  return events.filter((event) => event.currency === currency);
}
