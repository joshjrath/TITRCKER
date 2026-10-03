/**
 * Set aside: an optional manual record of money reserved for the tithe (ARCHITECTURE §3.9).
 *
 * Balance = reserves − releases, per currency. The running balance in canonical date order
 * (effectiveOn, reserve before release, createdAt, id) may never go negative. Reserving money
 * never changes what is owed; "still to set aside" = max(0, still to give − set-aside balance).
 */
import type { Currency } from './constants';
import type { LocalDate } from './dates';
import { addMinor, clampZero, negMinor, subMinor, ZERO, type Minor } from './money';
import type { SetAsideRecord } from './records';
import { compareByDateCreatedId } from './ordering';

const KIND_ORDER: Record<SetAsideRecord['kind'], number> = { reserve: 0, release: 1 };

/** Canonical set-aside order: effectiveOn, reserve before release, createdAt, id. */
export function compareSetAside(a: SetAsideRecord, b: SetAsideRecord): number {
  if (a.effectiveOn !== b.effectiveOn) return a.effectiveOn < b.effectiveOn ? -1 : 1;
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    compareByDateCreatedId(
      { date: a.effectiveOn, createdAt: a.createdAt, id: a.id },
      { date: b.effectiveOn, createdAt: b.createdAt, id: b.id },
    )
  );
}

/** Signed effect of one entry on the balance: +amount for reserve, −amount for release. */
export function setAsideEffect(record: SetAsideRecord): Minor {
  return record.kind === 'reserve' ? record.amountMinor : negMinor(record.amountMinor);
}

/** Current set-aside balance for a currency: reserves − releases. */
export function setAsideBalance(records: readonly SetAsideRecord[], currency: Currency): Minor {
  return records
    .filter((r) => r.currency === currency)
    .reduce<Minor>((balance, r) => addMinor(balance, setAsideEffect(r)), ZERO);
}

/** Entries of one currency in canonical order, each with the running balance after it. */
export function setAsideHistory(
  records: readonly SetAsideRecord[],
  currency: Currency,
): (SetAsideRecord & { runningBalanceMinor: Minor })[] {
  let running = ZERO;
  return records
    .filter((r) => r.currency === currency)
    .sort(compareSetAside)
    .map((record) => {
      running = addMinor(running, setAsideEffect(record));
      return { ...record, runningBalanceMinor: running };
    });
}

/**
 * Verifies that no currency's running balance ever goes negative. Services validate the history
 * *including* a proposed new entry (or excluding a deleted one) before writing.
 * Returns the first currency and date where the balance would dip below zero.
 */
export function validateSetAsideHistory(
  records: readonly SetAsideRecord[],
): { ok: true } | { ok: false; currency: Currency; date: LocalDate; shortfallMinor: Minor } {
  const currencies = [...new Set(records.map((r) => r.currency))].sort();
  for (const currency of currencies) {
    for (const entry of setAsideHistory(records, currency)) {
      if (entry.runningBalanceMinor < 0) {
        return { ok: false, currency, date: entry.effectiveOn, shortfallMinor: negMinor(entry.runningBalanceMinor) };
      }
    }
  }
  return { ok: true };
}

/** Still to set aside: the positive remainder of still-to-give after the set-aside balance. */
export function stillToSetAside(stillToGiveMinor: Minor, setAsideMinor: Minor): Minor {
  return clampZero(subMinor(stillToGiveMinor, setAsideMinor));
}
