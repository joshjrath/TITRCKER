import "server-only";

import {
  formatLocalDate,
  formatMoney,
  maxMinor,
  minMinor,
  setAsideHistory,
  validateSetAsideHistory,
  ZERO,
  type Currency,
  type LocalDate,
  type Minor,
  type SetAsideRecord,
} from "@/domain";

import { ServiceError } from "./errors";

/**
 * A createdAt that sorts after every stored row: a new entry is inserted with the database's now(), so among
 * entries on the same date it is always last in canonical order. Used only for pre-insert validation.
 */
export const PENDING_CREATED_AT = "9999-12-31T23:59:59.999Z";

/**
 * The largest release that can be dated `date` without the running balance dipping below zero at any point:
 * min(balance through `date`, every later running balance). Never negative.
 */
export function maxReleaseOn(records: readonly SetAsideRecord[], currency: Currency, date: LocalDate): Minor {
  let available: Minor = ZERO;
  // History is in canonical (ascending) order: entries on/before `date` set the balance through that date,
  // and every later running balance would drop by the release amount.
  for (const entry of setAsideHistory(records, currency)) {
    available = entry.effectiveOn <= date ? entry.runningBalanceMinor : minMinor(available, entry.runningBalanceMinor);
  }
  return maxMinor(available, ZERO);
}

/** Throws `limit_exceeded` (field `field`) when the history would ever go below zero. */
export function assertSetAsideHistory(records: readonly SetAsideRecord[], field: string): void {
  const check = validateSetAsideHistory(records);
  if (check.ok) return;
  const message = `That would take Set aside below zero on ${formatLocalDate(check.date)} (short by ${formatMoney(check.shortfallMinor, check.currency)}).`;
  throw new ServiceError("limit_exceeded", message, { [field]: message });
}
