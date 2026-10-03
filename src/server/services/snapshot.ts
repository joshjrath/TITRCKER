import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import type {
  BackupAuditEvent,
  BackupRecords,
  LedgerSnapshot,
  LocalDate,
  TrackingSettings,
} from "@/domain";
import type { SettingsVM } from "@/lib/view-models";
import {
  auditEvent,
  churchPayment,
  incomeAdjustment,
  incomeEntry,
  openingObligation,
  paymentAllocation,
  setAsideEntry,
} from "@/server/db/schema";
import { readSettingsRow, withOwnerSnapshot, type AppSettingsRow, type OwnerTx } from "@/server/db/with-owner";

import type { ServiceContext } from "./context";
import {
  adjustmentRecordFromRow,
  groupAllocations,
  incomeRecordFromRow,
  isoOrNull,
  iso,
  openingRecordFromRow,
  paymentRecordFromRow,
  setAsideRecordFromRow,
} from "./records";
import { settingsVMFromRow, todayForSettings, trackingSettingsFromRow } from "./settings";

/**
 * Loads the owner's ACTIVE records as a domain LedgerSnapshot: deleted incomes/adjustments/openings/
 * set-asides and reversed payments are excluded, as are adjustments whose income is deleted.
 */
export async function loadActiveSnapshot(tx: OwnerTx, ownerId: string): Promise<LedgerSnapshot> {
  const incomes = await tx
    .select()
    .from(incomeEntry)
    .where(and(eq(incomeEntry.ownerId, ownerId), isNull(incomeEntry.deletedAt)))
    .orderBy(asc(incomeEntry.receivedOn), asc(incomeEntry.createdAt), asc(incomeEntry.id));

  const adjustments = await tx
    .select({ adjustment: incomeAdjustment })
    .from(incomeAdjustment)
    .innerJoin(
      incomeEntry,
      and(eq(incomeEntry.id, incomeAdjustment.incomeId), eq(incomeEntry.ownerId, incomeAdjustment.ownerId)),
    )
    .where(
      and(eq(incomeAdjustment.ownerId, ownerId), isNull(incomeAdjustment.deletedAt), isNull(incomeEntry.deletedAt)),
    )
    .orderBy(asc(incomeAdjustment.effectiveOn), asc(incomeAdjustment.createdAt), asc(incomeAdjustment.id));

  const openings = await tx
    .select()
    .from(openingObligation)
    .where(and(eq(openingObligation.ownerId, ownerId), isNull(openingObligation.deletedAt)))
    .orderBy(asc(openingObligation.effectiveOn), asc(openingObligation.createdAt), asc(openingObligation.id));

  const payments = await tx
    .select()
    .from(churchPayment)
    .where(and(eq(churchPayment.ownerId, ownerId), isNull(churchPayment.reversedAt)))
    .orderBy(asc(churchPayment.paidOn), asc(churchPayment.createdAt), asc(churchPayment.id));

  const allocations =
    payments.length === 0
      ? []
      : await tx
          .select()
          .from(paymentAllocation)
          .where(
            and(
              eq(paymentAllocation.ownerId, ownerId),
              inArray(
                paymentAllocation.paymentId,
                payments.map((p) => p.id),
              ),
            ),
          );
  const allocationsByPayment = groupAllocations(allocations);

  const setAsides = await tx
    .select()
    .from(setAsideEntry)
    .where(and(eq(setAsideEntry.ownerId, ownerId), isNull(setAsideEntry.deletedAt)))
    .orderBy(asc(setAsideEntry.effectiveOn), asc(setAsideEntry.createdAt), asc(setAsideEntry.id));

  return {
    incomes: incomes.map(incomeRecordFromRow),
    adjustments: adjustments.map((r) => adjustmentRecordFromRow(r.adjustment)),
    openings: openings.map(openingRecordFromRow),
    payments: payments.map((p) => paymentRecordFromRow(p, allocationsByPayment.get(p.id) ?? [])),
    setAsides: setAsides.map(setAsideRecordFromRow),
  };
}

export interface OwnerLedger {
  settingsRow: AppSettingsRow;
  settings: SettingsVM;
  tracking: TrackingSettings;
  today: LocalDate;
  snapshot: LedgerSnapshot;
}

/** Settings + active snapshot + today, loaded in one owner-scoped transaction (consistent read). */
export async function loadOwnerLedgerTx(tx: OwnerTx, ctx: ServiceContext): Promise<OwnerLedger> {
  const settingsRow = await readSettingsRow(tx, ctx.ownerId);
  const snapshot = await loadActiveSnapshot(tx, ctx.ownerId);
  return {
    settingsRow,
    settings: settingsVMFromRow(settingsRow),
    tracking: trackingSettingsFromRow(settingsRow),
    today: todayForSettings(settingsRow, ctx.now),
    snapshot,
  };
}

/** For read models: settings + active snapshot for the session owner. */
export async function loadOwnerLedger(ctx: ServiceContext): Promise<OwnerLedger> {
  return withOwnerSnapshot(ctx.ownerId, (tx) => loadOwnerLedgerTx(tx, ctx));
}

export interface FullHistory {
  settingsRow: AppSettingsRow;
  records: BackupRecords;
  auditEvents: BackupAuditEvent[];
}

/** Every record including soft-deleted / reversed ones, plus the audit trail (for JSON backups). */
export async function loadFullHistory(tx: OwnerTx, ownerId: string): Promise<FullHistory> {
  const settingsRow = await readSettingsRow(tx, ownerId);
  const incomes = await tx
    .select()
    .from(incomeEntry)
    .where(eq(incomeEntry.ownerId, ownerId))
    .orderBy(asc(incomeEntry.receivedOn), asc(incomeEntry.createdAt), asc(incomeEntry.id));
  const adjustments = await tx
    .select()
    .from(incomeAdjustment)
    .where(eq(incomeAdjustment.ownerId, ownerId))
    .orderBy(asc(incomeAdjustment.effectiveOn), asc(incomeAdjustment.createdAt), asc(incomeAdjustment.id));
  const openings = await tx
    .select()
    .from(openingObligation)
    .where(eq(openingObligation.ownerId, ownerId))
    .orderBy(asc(openingObligation.effectiveOn), asc(openingObligation.createdAt), asc(openingObligation.id));
  const payments = await tx
    .select()
    .from(churchPayment)
    .where(eq(churchPayment.ownerId, ownerId))
    .orderBy(asc(churchPayment.paidOn), asc(churchPayment.createdAt), asc(churchPayment.id));
  const allocations = await tx.select().from(paymentAllocation).where(eq(paymentAllocation.ownerId, ownerId));
  const allocationsByPayment = groupAllocations(allocations);
  const setAsides = await tx
    .select()
    .from(setAsideEntry)
    .where(eq(setAsideEntry.ownerId, ownerId))
    .orderBy(asc(setAsideEntry.effectiveOn), asc(setAsideEntry.createdAt), asc(setAsideEntry.id));
  const audits = await tx
    .select({
      id: auditEvent.id,
      entityType: auditEvent.entityType,
      entityId: auditEvent.entityId,
      action: auditEvent.action,
      reason: auditEvent.reason,
      createdAt: auditEvent.createdAt,
    })
    .from(auditEvent)
    .where(eq(auditEvent.ownerId, ownerId))
    .orderBy(desc(auditEvent.createdAt), desc(auditEvent.id));

  return {
    settingsRow,
    records: {
      incomes: incomes.map((r) => ({
        ...incomeRecordFromRow(r),
        deletedAt: isoOrNull(r.deletedAt),
        deletedReason: r.deletedReason,
      })),
      adjustments: adjustments.map((r) => ({
        ...adjustmentRecordFromRow(r),
        deletedAt: isoOrNull(r.deletedAt),
        deletedReason: r.deletedReason,
      })),
      openings: openings.map((r) => ({
        ...openingRecordFromRow(r),
        deletedAt: isoOrNull(r.deletedAt),
        deletedReason: r.deletedReason,
      })),
      payments: payments.map((r) => ({
        ...paymentRecordFromRow(r, allocationsByPayment.get(r.id) ?? []),
        reversedAt: isoOrNull(r.reversedAt),
        reversalReason: r.reversalReason,
      })),
      setAsides: setAsides.map((r) => ({
        ...setAsideRecordFromRow(r),
        deletedAt: isoOrNull(r.deletedAt),
        deletedReason: r.deletedReason,
      })),
    },
    auditEvents: audits.map((a) => ({ ...a, createdAt: iso(a.createdAt) })),
  };
}
