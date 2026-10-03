import "server-only";

/**
 * Row -> domain record mappers. Every money column is re-checked as a safe integer (toMinor), every date
 * as a real local date (toLocalDate), and enumerations against the domain constants, so a corrupted row
 * fails loudly instead of producing wrong totals.
 */
import {
  ROUNDING_POLICY,
  isCurrency,
  toLocalDate,
  toMinor,
  type AdjustmentKind,
  type AdjustmentRecord,
  type AllocationRecord,
  type Currency,
  type IncomeRecord,
  type OpeningObligationRecord,
  type PaymentRecord,
  type RoundingPolicy,
  type SetAsideKind,
  type SetAsideRecord,
} from "@/domain";
import type {
  churchPayment,
  incomeAdjustment,
  incomeEntry,
  openingObligation,
  paymentAllocation,
  setAsideEntry,
} from "@/server/db/schema";

export type IncomeRow = typeof incomeEntry.$inferSelect;
export type AdjustmentRow = typeof incomeAdjustment.$inferSelect;
export type OpeningRow = typeof openingObligation.$inferSelect;
export type PaymentRow = typeof churchPayment.$inferSelect;
export type AllocationRow = typeof paymentAllocation.$inferSelect;
export type SetAsideRow = typeof setAsideEntry.$inferSelect;

export function toCurrency(value: string): Currency {
  if (!isCurrency(value)) throw new RangeError("Unsupported currency in stored row");
  return value;
}

export function toRoundingPolicy(value: string): RoundingPolicy {
  if (value !== ROUNDING_POLICY) throw new RangeError("Unknown rounding policy in stored row");
  return value;
}

function toAdjustmentKind(value: string): AdjustmentKind {
  if (value !== "refund" && value !== "correction") throw new RangeError("Unknown adjustment kind in stored row");
  return value;
}

function toSetAsideKind(value: string): SetAsideKind {
  if (value !== "reserve" && value !== "release") throw new RangeError("Unknown set-aside kind in stored row");
  return value;
}

export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function incomeRecordFromRow(row: IncomeRow): IncomeRecord {
  return {
    id: row.id,
    currency: toCurrency(row.currency),
    amountMinor: toMinor(row.amountMinor),
    receivedOn: toLocalDate(row.receivedOn),
    titheRateBps: row.titheRateBps,
    roundingPolicy: toRoundingPolicy(row.roundingPolicy),
    titheMinor: toMinor(row.titheMinor),
    source: row.source,
    category: row.category,
    note: row.note,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    version: row.version,
  };
}

export function adjustmentRecordFromRow(row: AdjustmentRow): AdjustmentRecord {
  return {
    id: row.id,
    incomeId: row.incomeId,
    kind: toAdjustmentKind(row.kind),
    amountMinor: toMinor(row.amountMinor),
    effectiveOn: toLocalDate(row.effectiveOn),
    reason: row.reason,
    createdAt: iso(row.createdAt),
  };
}

export function openingRecordFromRow(row: OpeningRow): OpeningObligationRecord {
  return {
    id: row.id,
    currency: toCurrency(row.currency),
    amountMinor: toMinor(row.amountMinor),
    effectiveOn: toLocalDate(row.effectiveOn),
    label: row.label,
    note: row.note,
    createdAt: iso(row.createdAt),
    version: row.version,
  };
}

export function allocationRecordFromRow(row: AllocationRow): AllocationRecord {
  return { bucketYear: row.bucketYear, amountMinor: toMinor(row.amountMinor) };
}

export function paymentRecordFromRow(row: PaymentRow, allocations: readonly AllocationRow[]): PaymentRecord {
  return {
    id: row.id,
    currency: toCurrency(row.currency),
    amountMinor: toMinor(row.amountMinor),
    paidOn: toLocalDate(row.paidOn),
    churchName: row.churchName,
    reference: row.reference,
    note: row.note,
    createdAt: iso(row.createdAt),
    version: row.version,
    allocations: [...allocations]
      .sort((a, b) => a.bucketYear - b.bucketYear)
      .map(allocationRecordFromRow),
  };
}

export function setAsideRecordFromRow(row: SetAsideRow): SetAsideRecord {
  return {
    id: row.id,
    currency: toCurrency(row.currency),
    kind: toSetAsideKind(row.kind),
    amountMinor: toMinor(row.amountMinor),
    effectiveOn: toLocalDate(row.effectiveOn),
    note: row.note,
    paymentId: row.paymentId,
    createdAt: iso(row.createdAt),
  };
}

/** Groups allocation rows by payment id. */
export function groupAllocations(rows: readonly AllocationRow[]): Map<string, AllocationRow[]> {
  const grouped = new Map<string, AllocationRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.paymentId);
    if (list) list.push(row);
    else grouped.set(row.paymentId, [row]);
  }
  return grouped;
}
