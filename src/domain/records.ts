/**
 * Input record shapes for the domain layer.
 *
 * These are ACTIVE records only: the data loader excludes soft-deleted incomes, adjustments,
 * openings and set-aside entries, and reversed payments, before calling any domain function.
 * Adjustments whose income is not in the snapshot (because the income was deleted) are ignored.
 */
import type { Currency, RoundingPolicy } from './constants';
import type { LocalDate } from './dates';
import type { Minor } from './money';

export interface IncomeRecord {
  id: string;
  currency: Currency;
  amountMinor: Minor;
  receivedOn: LocalDate;
  titheRateBps: number;
  roundingPolicy: RoundingPolicy;
  titheMinor: Minor;
  source: string | null;
  category: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type AdjustmentKind = 'refund' | 'correction';

export interface AdjustmentRecord {
  id: string;
  incomeId: string;
  kind: AdjustmentKind;
  amountMinor: Minor;
  effectiveOn: LocalDate;
  reason: string;
  createdAt: string;
}

export interface OpeningObligationRecord {
  id: string;
  currency: Currency;
  amountMinor: Minor;
  effectiveOn: LocalDate;
  label: string;
  note: string | null;
  createdAt: string;
  version: number;
}

export interface AllocationRecord {
  bucketYear: number;
  amountMinor: Minor;
}

export interface PaymentRecord {
  id: string;
  currency: Currency;
  amountMinor: Minor;
  paidOn: LocalDate;
  churchName: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  version: number;
  allocations: AllocationRecord[];
}

export type SetAsideKind = 'reserve' | 'release';

export interface SetAsideRecord {
  id: string;
  currency: Currency;
  kind: SetAsideKind;
  amountMinor: Minor;
  effectiveOn: LocalDate;
  note: string | null;
  paymentId: string | null;
  createdAt: string;
}

export interface LedgerSnapshot {
  incomes: IncomeRecord[];
  adjustments: AdjustmentRecord[];
  openings: OpeningObligationRecord[];
  payments: PaymentRecord[];
  setAsides: SetAsideRecord[];
}

export interface TrackingSettings {
  trackingStart: LocalDate;
  timeZone: string;
  displayCurrency: Currency;
  nextPayoutDate: LocalDate;
  nextPayoutIsDefault: boolean;
}

/** An empty snapshot (no records at all). */
export function emptySnapshot(): LedgerSnapshot {
  return { incomes: [], adjustments: [], openings: [], payments: [], setAsides: [] };
}

/**
 * Groups adjustments by income id, keeping only those whose income is present (active) in the
 * snapshot. Adjustments of a deleted income never affect any total.
 */
export function adjustmentsByIncome(snapshot: LedgerSnapshot): Map<string, AdjustmentRecord[]> {
  const activeIncomeIds = new Set(snapshot.incomes.map((income) => income.id));
  const grouped = new Map<string, AdjustmentRecord[]>();
  for (const adjustment of snapshot.adjustments) {
    if (!activeIncomeIds.has(adjustment.incomeId)) continue;
    const list = grouped.get(adjustment.incomeId);
    if (list) list.push(adjustment);
    else grouped.set(adjustment.incomeId, [adjustment]);
  }
  return grouped;
}
