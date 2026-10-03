/**
 * Payout schedule (ARCHITECTURE §3.8).
 *
 * - Before the payout date: "N days until payout"; the amount due is all-time still to give.
 * - On the payout date: "Due today".
 * - After it: "Overdue" with, per currency,
 *   overdue = Σ_b max(0, min(accrued_b through payout date, accrued_b) − allocated_b − credit_applied_b).
 *   Only obligations dated on or before the payout date count, and refunds dated after it reduce
 *   accrued_b (or feed the credit pool), so they can never create phantom overdue amounts.
 * - If the payout date has passed and nothing is overdue, the target rolls to Dec 31 of the current
 *   year and is labelled as the default.
 * Day counts are local calendar-date differences, so DST never changes them.
 */
import { CURRENCIES, type Currency } from './constants';
import { daysBetween, endOfYear, yearOf, type LocalDate } from './dates';
import { addMinor, clampZero, minMinor, subMinor, sumMinor, ZERO, type Minor } from './money';
import type { CurrencyBalance } from './balances';
import type { ObligationEvent } from './obligations';

export type PayoutPhase = 'upcoming' | 'due_today' | 'overdue' | 'settled_rolled';

export interface PayoutCurrencyStatus {
  currency: Currency;
  /** All-time still to give. */
  dueMinor: Minor;
  /** Overdue part (0 unless the payout date has passed). */
  overdueMinor: Minor;
}

export interface PayoutStatus {
  phase: PayoutPhase;
  /** The configured next payout date. */
  plannedDate: LocalDate;
  /** The planned date, or the rolled-over Dec 31 when settled_rolled. */
  targetDate: LocalDate;
  isDefaultDate: boolean;
  /** Days until the target (upcoming / settled_rolled); never 0 — that is due_today. */
  daysUntil: number | null;
  /** Days since the planned date (overdue only). */
  daysOverdue: number | null;
  perCurrency: PayoutCurrencyStatus[];
  /** '89 days until payout', '1 day until payout', 'Due today', 'Overdue by 3 days'. */
  label: string;
}

const pluralDays = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;

/** "N days until payout" with the singular for 1. */
export function daysUntilLabel(days: number): string {
  return `${pluralDays(days)} until payout`;
}

/** "Overdue by N days" with the singular for 1. */
export function overdueLabel(days: number): string {
  return `Overdue by ${pluralDays(days)}`;
}

export const DUE_TODAY_LABEL = 'Due today';

/**
 * The overdue amount of one currency as of `payoutDate`:
 * Σ_b max(0, min(accrued_b through payoutDate, accrued_b) − allocated_b − creditApplied_b).
 */
export function computeOverdue(
  balance: CurrencyBalance,
  events: readonly ObligationEvent[],
  payoutDate: LocalDate,
): Minor {
  const accruedThrough = new Map<number, Minor>();
  for (const event of events) {
    if (event.currency !== balance.currency || event.date > payoutDate) continue;
    accruedThrough.set(event.bucketYear, addMinor(accruedThrough.get(event.bucketYear) ?? ZERO, event.amountMinor));
  }
  return sumMinor(
    balance.buckets.map((bucket) => {
      const dueBase = minMinor(accruedThrough.get(bucket.year) ?? ZERO, bucket.accruedMinor);
      return clampZero(subMinor(subMinor(dueBase, bucket.allocatedMinor), bucket.creditAppliedMinor));
    }),
  );
}

/** Computes the payout countdown / due / overdue state for every currency. */
export function computePayoutStatus(input: {
  today: LocalDate;
  plannedDate: LocalDate;
  isDefaultDate: boolean;
  balances: Record<Currency, CurrencyBalance>;
  events: readonly ObligationEvent[];
}): PayoutStatus {
  const { today, plannedDate, isDefaultDate, balances, events } = input;
  const dueOnly = (): PayoutCurrencyStatus[] =>
    CURRENCIES.map((currency) => ({ currency, dueMinor: balances[currency].stillToGiveMinor, overdueMinor: ZERO }));
  const base = { plannedDate, isDefaultDate, daysUntil: null, daysOverdue: null };

  const daysToPlanned = daysBetween(today, plannedDate);
  if (daysToPlanned > 0) {
    return {
      ...base,
      phase: 'upcoming',
      targetDate: plannedDate,
      daysUntil: daysToPlanned,
      perCurrency: dueOnly(),
      label: daysUntilLabel(daysToPlanned),
    };
  }
  if (daysToPlanned === 0) {
    return { ...base, phase: 'due_today', targetDate: plannedDate, perCurrency: dueOnly(), label: DUE_TODAY_LABEL };
  }

  const perCurrency = CURRENCIES.map((currency) => ({
    currency,
    dueMinor: balances[currency].stillToGiveMinor,
    overdueMinor: computeOverdue(balances[currency], events, plannedDate),
  }));
  if (perCurrency.some((c) => c.overdueMinor > 0)) {
    const daysOverdue = -daysToPlanned;
    return {
      ...base,
      phase: 'overdue',
      targetDate: plannedDate,
      daysOverdue,
      perCurrency,
      label: overdueLabel(daysOverdue),
    };
  }

  const rolledTarget = endOfYear(yearOf(today));
  const daysToRolled = daysBetween(today, rolledTarget);
  if (daysToRolled === 0) {
    return { ...base, phase: 'due_today', targetDate: rolledTarget, isDefaultDate: true, perCurrency, label: DUE_TODAY_LABEL };
  }
  return {
    ...base,
    phase: 'settled_rolled',
    targetDate: rolledTarget,
    isDefaultDate: true,
    daysUntil: daysToRolled,
    perCurrency,
    label: daysUntilLabel(daysToRolled),
  };
}
