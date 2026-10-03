import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import {
  ROUNDING_POLICY,
  TITHE_RATE_BPS,
  adjustmentTitheDeltas,
  checkRefundAmount,
  computeTithe,
  formatLocalDate,
  formatMoney,
  minLocalDate,
  refundLimitMessage,
  sumMinor,
  toLocalDate,
  toMinor,
  type LocalDate,
} from "@/domain";
import {
  adjustmentCreateSchema,
  adjustmentDeleteSchema,
  incomeCreateSchema,
  incomeDeleteSchema,
  incomeRestoreSchema,
  incomeUpdateSchema,
  type AdjustmentCreateInput,
  type AdjustmentDeleteInput,
  type IncomeCreateInput,
  type IncomeDeleteInput,
  type IncomeRestoreInput,
  type IncomeUpdateInput,
} from "@/lib/validation";
import type { AdjustmentMutationResult, IdResult, IncomeMutationResult } from "@/lib/view-models";
import { appSettings, incomeAdjustment, incomeEntry } from "@/server/db/schema";
import type { OwnerTx } from "@/server/db/with-owner";

import { appendAudit } from "./audit";
import type { ServiceContext } from "./context";
import { notFoundError, ServiceError, staleError, validationError } from "./errors";
import { idempotentMutation } from "./mutation";
import {
  adjustmentRecordFromRow,
  incomeRecordFromRow,
  isoOrNull,
  toCurrency,
  type AdjustmentRow,
  type IncomeRow,
} from "./records";
import { assertNotFuture, assertOnOrAfterTrackingStart } from "./rules";

export const INCOME_OPERATIONS = {
  create: "income.create",
  update: "income.update",
  delete: "income.delete",
  restore: "income.restore",
  createAdjustment: "adjustment.create",
  deleteAdjustment: "adjustment.delete",
} as const;

const INCOME_NOT_FOUND = "That income entry could not be found. It may have been deleted.";

// ---------------------------------------------------------------------------------------------
// Loading helpers (always filtered by owner_id explicitly; RLS is the backstop)
// ---------------------------------------------------------------------------------------------

async function findIncome(tx: OwnerTx, ownerId: string, id: string): Promise<IncomeRow | undefined> {
  const [row] = await tx
    .select()
    .from(incomeEntry)
    .where(and(eq(incomeEntry.ownerId, ownerId), eq(incomeEntry.id, id)));
  return row;
}

async function findActiveIncome(tx: OwnerTx, ownerId: string, id: string): Promise<IncomeRow> {
  const row = await findIncome(tx, ownerId, id);
  if (!row || row.deletedAt !== null) throw notFoundError(INCOME_NOT_FOUND);
  return row;
}

async function activeAdjustmentsOf(tx: OwnerTx, ownerId: string, incomeId: string): Promise<AdjustmentRow[]> {
  return tx
    .select()
    .from(incomeAdjustment)
    .where(
      and(
        eq(incomeAdjustment.ownerId, ownerId),
        eq(incomeAdjustment.incomeId, incomeId),
        isNull(incomeAdjustment.deletedAt),
      ),
    )
    .orderBy(asc(incomeAdjustment.effectiveOn), asc(incomeAdjustment.createdAt), asc(incomeAdjustment.id));
}

function incomeSnapshot(row: IncomeRow) {
  return { ...incomeRecordFromRow(row), deletedAt: isoOrNull(row.deletedAt), deletedReason: row.deletedReason };
}

function adjustmentSnapshot(row: AdjustmentRow) {
  return { ...adjustmentRecordFromRow(row), deletedAt: isoOrNull(row.deletedAt), deletedReason: row.deletedReason };
}

function incomeResult(row: IncomeRow): IncomeMutationResult {
  const record = incomeRecordFromRow(row);
  return {
    id: record.id,
    currency: record.currency,
    amountMinor: record.amountMinor,
    titheMinor: record.titheMinor,
    receivedOn: record.receivedOn,
  };
}

// ---------------------------------------------------------------------------------------------
// Income entries
// ---------------------------------------------------------------------------------------------

/**
 * Records money received. Rules: date <= today (owner's zone) and >= tracking start; amount parsed strictly;
 * tithe = computeTithe(amount) under the current fixed rate/policy (also enforced by a DB CHECK).
 * Also remembers the currency as settings.last_entry_currency.
 */
export async function createIncome(ctx: ServiceContext, raw: IncomeCreateInput): Promise<IncomeMutationResult> {
  return idempotentMutation(ctx, INCOME_OPERATIONS.create, incomeCreateSchema, raw, async (m) => {
    const { data } = m;
    assertNotFuture(data.receivedOn, m.today, "receivedOn", "The received date");
    assertOnOrAfterTrackingStart(data.receivedOn, m.settings.trackingStart, "receivedOn");

    const [row] = await m.tx
      .insert(incomeEntry)
      .values({
        ownerId: m.ownerId,
        currency: data.currency,
        amountMinor: data.amount,
        receivedOn: data.receivedOn,
        source: data.source,
        category: data.category,
        note: data.note,
        titheRateBps: TITHE_RATE_BPS,
        roundingPolicy: ROUNDING_POLICY,
        titheMinor: computeTithe(data.amount, TITHE_RATE_BPS, ROUNDING_POLICY),
      })
      .returning();
    if (!row) throw new Error("income insert returned no row");

    await appendAudit(m.tx, m.ownerId, {
      entityType: "income",
      entityId: row.id,
      action: "create",
      after: incomeSnapshot(row),
    });

    if (m.settings.lastEntryCurrency !== data.currency) {
      await m.tx
        .update(appSettings)
        .set({ lastEntryCurrency: data.currency, updatedAt: sql`now()` })
        .where(eq(appSettings.ownerId, m.ownerId));
    }
    return incomeResult(row);
  });
}

/**
 * Edits an active income entry with optimistic concurrency (`expectedVersion`). A stale version fails with
 * `stale` unless the row already holds exactly the requested values (then it is a successful no-op).
 * Rules: as create, plus Σ active adjustments <= new amount and received date <= earliest adjustment date.
 * The tithe is recomputed with the entry's persisted rate and policy.
 */
export async function updateIncome(ctx: ServiceContext, raw: IncomeUpdateInput): Promise<IncomeMutationResult> {
  return idempotentMutation(ctx, INCOME_OPERATIONS.update, incomeUpdateSchema, raw, async (m) => {
    const { data } = m;
    const row = await findActiveIncome(m.tx, m.ownerId, data.id);

    const unchanged =
      row.amountMinor === data.amount &&
      row.currency === data.currency &&
      row.receivedOn === data.receivedOn &&
      row.source === data.source &&
      row.category === data.category &&
      row.note === data.note;
    if (unchanged) return incomeResult(row);
    if (row.version !== data.expectedVersion) throw staleError();

    assertNotFuture(data.receivedOn, m.today, "receivedOn", "The received date");
    assertOnOrAfterTrackingStart(data.receivedOn, m.settings.trackingStart, "receivedOn");

    const adjustments = (await activeAdjustmentsOf(m.tx, m.ownerId, row.id)).map(adjustmentRecordFromRow);
    if (adjustments.length > 0) {
      const refunded = sumMinor(adjustments.map((a) => a.amountMinor));
      const currency = toCurrency(data.currency);
      if (data.amount < refunded) {
        throw validationError({
          amount: `Refunds on this entry total ${formatMoney(refunded, currency)}, so the amount can't be lower than that.`,
        });
      }
      const earliest = minLocalDate(adjustments[0]!.effectiveOn, ...adjustments.map((a) => a.effectiveOn));
      if (data.receivedOn > earliest) {
        throw validationError({
          receivedOn: `This entry has a refund dated ${formatLocalDate(earliest)}, so it must be received on or before that date.`,
        });
      }
    }

    const rateBps = row.titheRateBps;
    const policy = incomeRecordFromRow(row).roundingPolicy;
    const [updated] = await m.tx
      .update(incomeEntry)
      .set({
        currency: data.currency,
        amountMinor: data.amount,
        receivedOn: data.receivedOn,
        source: data.source,
        category: data.category,
        note: data.note,
        titheMinor: computeTithe(data.amount, rateBps, policy),
        updatedAt: sql`now()`,
        version: sql`${incomeEntry.version} + 1`,
      })
      .where(
        and(
          eq(incomeEntry.ownerId, m.ownerId),
          eq(incomeEntry.id, row.id),
          eq(incomeEntry.version, row.version),
          isNull(incomeEntry.deletedAt),
        ),
      )
      .returning();
    if (!updated) throw staleError();

    await appendAudit(m.tx, m.ownerId, {
      entityType: "income",
      entityId: row.id,
      action: "update",
      before: incomeSnapshot(row),
      after: incomeSnapshot(updated),
    });
    return incomeResult(updated);
  });
}

/** Soft-deletes an income entry (with optional reason). Idempotent: deleting a deleted entry succeeds. */
export async function deleteIncome(ctx: ServiceContext, raw: IncomeDeleteInput): Promise<IdResult> {
  return idempotentMutation(ctx, INCOME_OPERATIONS.delete, incomeDeleteSchema, raw, async (m) => {
    const row = await findIncome(m.tx, m.ownerId, m.data.id);
    if (!row) throw notFoundError(INCOME_NOT_FOUND);
    if (row.deletedAt !== null) return { id: row.id };

    const [updated] = await m.tx
      .update(incomeEntry)
      .set({
        deletedAt: sql`now()`,
        deletedReason: m.data.reason,
        updatedAt: sql`now()`,
        version: sql`${incomeEntry.version} + 1`,
      })
      .where(and(eq(incomeEntry.ownerId, m.ownerId), eq(incomeEntry.id, row.id)))
      .returning();
    if (!updated) throw notFoundError(INCOME_NOT_FOUND);

    await appendAudit(m.tx, m.ownerId, {
      entityType: "income",
      entityId: row.id,
      action: "delete",
      before: incomeSnapshot(row),
      after: incomeSnapshot(updated),
      reason: m.data.reason,
    });
    return { id: row.id };
  });
}

/** Restores a soft-deleted income entry (undo). Idempotent. Its date must still be on/after the tracking start. */
export async function restoreIncome(ctx: ServiceContext, raw: IncomeRestoreInput): Promise<IdResult> {
  return idempotentMutation(ctx, INCOME_OPERATIONS.restore, incomeRestoreSchema, raw, async (m) => {
    const row = await findIncome(m.tx, m.ownerId, m.data.id);
    if (!row) throw notFoundError(INCOME_NOT_FOUND);
    if (row.deletedAt === null) return { id: row.id };
    assertOnOrAfterTrackingStart(toLocalDate(row.receivedOn), m.settings.trackingStart, "receivedOn");

    const [updated] = await m.tx
      .update(incomeEntry)
      .set({
        deletedAt: null,
        deletedReason: null,
        updatedAt: sql`now()`,
        version: sql`${incomeEntry.version} + 1`,
      })
      .where(and(eq(incomeEntry.ownerId, m.ownerId), eq(incomeEntry.id, row.id)))
      .returning();
    if (!updated) throw notFoundError(INCOME_NOT_FOUND);

    await appendAudit(m.tx, m.ownerId, {
      entityType: "income",
      entityId: row.id,
      action: "restore",
      before: incomeSnapshot(row),
      after: incomeSnapshot(updated),
    });
    return { id: row.id };
  });
}

// ---------------------------------------------------------------------------------------------
// Adjustments (refunds / corrections)
// ---------------------------------------------------------------------------------------------

/**
 * Records a refund/correction against an active income entry. Rules: effective date between the income's
 * received date and today; reason required; Σ active adjustments (including this one) <= received amount
 * (else `limit_exceeded`). Returns this adjustment's derived tithe delta (<= 0, canonical order).
 */
export async function createAdjustment(
  ctx: ServiceContext,
  raw: AdjustmentCreateInput,
): Promise<AdjustmentMutationResult> {
  return idempotentMutation(ctx, INCOME_OPERATIONS.createAdjustment, adjustmentCreateSchema, raw, async (m) => {
    const { data } = m;
    const incomeRow = await findActiveIncome(m.tx, m.ownerId, data.incomeId);
    const income = incomeRecordFromRow(incomeRow);

    if (data.effectiveOn < income.receivedOn) {
      throw validationError({
        effectiveOn: `The refund date can't be before the income was received (${formatLocalDate(income.receivedOn)}).`,
      });
    }
    assertNotFuture(data.effectiveOn, m.today, "effectiveOn", "The refund date");

    const existing = (await activeAdjustmentsOf(m.tx, m.ownerId, income.id)).map(adjustmentRecordFromRow);
    const check = checkRefundAmount(income, existing, data.amount);
    if (!check.ok) {
      const message = refundLimitMessage(check.refundableMinor, income.currency);
      throw new ServiceError("limit_exceeded", message, { amount: message });
    }

    const [row] = await m.tx
      .insert(incomeAdjustment)
      .values({
        ownerId: m.ownerId,
        incomeId: income.id,
        kind: data.kind,
        amountMinor: data.amount,
        effectiveOn: data.effectiveOn,
        reason: data.reason,
      })
      .returning();
    if (!row) throw new Error("adjustment insert returned no row");

    const created = adjustmentRecordFromRow(row);
    const deltas = adjustmentTitheDeltas(income, [...existing, created]);
    await appendAudit(m.tx, m.ownerId, {
      entityType: "adjustment",
      entityId: row.id,
      action: "create",
      after: adjustmentSnapshot(row),
      reason: data.reason,
    });
    return { id: row.id, titheDeltaMinor: deltas.get(row.id) ?? toMinor(0) };
  });
}

/** Soft-deletes an adjustment (with optional reason). Idempotent. */
export async function deleteAdjustment(ctx: ServiceContext, raw: AdjustmentDeleteInput): Promise<IdResult> {
  return idempotentMutation(ctx, INCOME_OPERATIONS.deleteAdjustment, adjustmentDeleteSchema, raw, async (m) => {
    const [row] = await m.tx
      .select()
      .from(incomeAdjustment)
      .where(and(eq(incomeAdjustment.ownerId, m.ownerId), eq(incomeAdjustment.id, m.data.id)));
    if (!row) throw notFoundError("That refund could not be found. It may have been deleted.");
    if (row.deletedAt !== null) return { id: row.id };

    const [updated] = await m.tx
      .update(incomeAdjustment)
      .set({ deletedAt: sql`now()`, deletedReason: m.data.reason })
      .where(and(eq(incomeAdjustment.ownerId, m.ownerId), eq(incomeAdjustment.id, row.id)))
      .returning();
    if (!updated) throw notFoundError();

    await appendAudit(m.tx, m.ownerId, {
      entityType: "adjustment",
      entityId: row.id,
      action: "delete",
      before: adjustmentSnapshot(row),
      after: adjustmentSnapshot(updated),
      reason: m.data.reason,
    });
    return { id: row.id };
  });
}

/** Earliest received date among the owner's active income (tracking start may not move past it). */
export async function earliestActiveIncomeDate(tx: OwnerTx, ownerId: string): Promise<LocalDate | null> {
  const [row] = await tx
    .select({ earliest: sql<string | null>`min(${incomeEntry.receivedOn})` })
    .from(incomeEntry)
    .where(and(eq(incomeEntry.ownerId, ownerId), isNull(incomeEntry.deletedAt)));
  return row?.earliest ? toLocalDate(row.earliest) : null;
}
