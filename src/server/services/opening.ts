import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import {
  openingCreateSchema,
  openingDeleteSchema,
  openingUpdateSchema,
  type OpeningCreateInput,
  type OpeningDeleteInput,
  type OpeningUpdateInput,
} from "@/lib/validation";
import type { IdResult } from "@/lib/view-models";
import { openingObligation } from "@/server/db/schema";
import type { OwnerTx } from "@/server/db/with-owner";

import { appendAudit } from "./audit";
import type { ServiceContext } from "./context";
import { notFoundError, staleError } from "./errors";
import { idempotentMutation } from "./mutation";
import { isoOrNull, openingRecordFromRow, type OpeningRow } from "./records";
import { assertNotFuture } from "./rules";

export const OPENING_OPERATIONS = {
  create: "opening.create",
  update: "opening.update",
  delete: "opening.delete",
} as const;

const OPENING_NOT_FOUND = "That opening balance could not be found. It may have been deleted.";

function snapshotOf(row: OpeningRow) {
  return { ...openingRecordFromRow(row), deletedAt: isoOrNull(row.deletedAt), deletedReason: row.deletedReason };
}

async function findOpening(tx: OwnerTx, ownerId: string, id: string): Promise<OpeningRow | undefined> {
  const [row] = await tx
    .select()
    .from(openingObligation)
    .where(and(eq(openingObligation.ownerId, ownerId), eq(openingObligation.id, id)));
  return row;
}

/**
 * Records an opening obligation: tithe owed from before the recorded history. Currency and effective date
 * (<= today; may be before the tracking start) are required. It adds to obligations and is never income.
 */
export async function createOpening(ctx: ServiceContext, raw: OpeningCreateInput): Promise<IdResult> {
  return idempotentMutation(ctx, OPENING_OPERATIONS.create, openingCreateSchema, raw, async (m) => {
    const { data } = m;
    assertNotFuture(data.effectiveOn, m.today, "effectiveOn", "The date");
    const [row] = await m.tx
      .insert(openingObligation)
      .values({
        ownerId: m.ownerId,
        currency: data.currency,
        amountMinor: data.amount,
        effectiveOn: data.effectiveOn,
        label: data.label,
        note: data.note,
      })
      .returning();
    if (!row) throw new Error("opening insert returned no row");
    await appendAudit(m.tx, m.ownerId, {
      entityType: "opening",
      entityId: row.id,
      action: "create",
      after: snapshotOf(row),
    });
    return { id: row.id };
  });
}

/** Edits an active opening obligation (optimistic concurrency; an identical edit is a no-op). */
export async function updateOpening(ctx: ServiceContext, raw: OpeningUpdateInput): Promise<IdResult> {
  return idempotentMutation(ctx, OPENING_OPERATIONS.update, openingUpdateSchema, raw, async (m) => {
    const { data } = m;
    const row = await findOpening(m.tx, m.ownerId, data.id);
    if (!row || row.deletedAt !== null) throw notFoundError(OPENING_NOT_FOUND);

    const unchanged =
      row.amountMinor === data.amount &&
      row.currency === data.currency &&
      row.effectiveOn === data.effectiveOn &&
      row.label === data.label &&
      row.note === data.note;
    if (unchanged) return { id: row.id };
    if (row.version !== data.expectedVersion) throw staleError();
    assertNotFuture(data.effectiveOn, m.today, "effectiveOn", "The date");

    const [updated] = await m.tx
      .update(openingObligation)
      .set({
        currency: data.currency,
        amountMinor: data.amount,
        effectiveOn: data.effectiveOn,
        label: data.label,
        note: data.note,
        updatedAt: sql`now()`,
        version: sql`${openingObligation.version} + 1`,
      })
      .where(
        and(
          eq(openingObligation.ownerId, m.ownerId),
          eq(openingObligation.id, row.id),
          eq(openingObligation.version, row.version),
          isNull(openingObligation.deletedAt),
        ),
      )
      .returning();
    if (!updated) throw staleError();

    await appendAudit(m.tx, m.ownerId, {
      entityType: "opening",
      entityId: row.id,
      action: "update",
      before: snapshotOf(row),
      after: snapshotOf(updated),
    });
    return { id: row.id };
  });
}

/** Soft-deletes an opening obligation (optional reason). Idempotent. */
export async function deleteOpening(ctx: ServiceContext, raw: OpeningDeleteInput): Promise<IdResult> {
  return idempotentMutation(ctx, OPENING_OPERATIONS.delete, openingDeleteSchema, raw, async (m) => {
    const row = await findOpening(m.tx, m.ownerId, m.data.id);
    if (!row) throw notFoundError(OPENING_NOT_FOUND);
    if (row.deletedAt !== null) return { id: row.id };

    const [deleted] = await m.tx
      .update(openingObligation)
      .set({
        deletedAt: sql`now()`,
        deletedReason: m.data.reason,
        updatedAt: sql`now()`,
        version: sql`${openingObligation.version} + 1`,
      })
      .where(and(eq(openingObligation.ownerId, m.ownerId), eq(openingObligation.id, row.id)))
      .returning();
    if (!deleted) throw notFoundError(OPENING_NOT_FOUND);

    await appendAudit(m.tx, m.ownerId, {
      entityType: "opening",
      entityId: row.id,
      action: "delete",
      before: snapshotOf(row),
      after: snapshotOf(deleted),
      reason: m.data.reason,
    });
    return { id: row.id };
  });
}
