import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import type { SetAsideRecord } from "@/domain";
import {
  setAsideCreateSchema,
  setAsideDeleteSchema,
  type SetAsideCreateInput,
  type SetAsideDeleteInput,
} from "@/lib/validation";
import type { IdResult } from "@/lib/view-models";
import { setAsideEntry } from "@/server/db/schema";
import type { OwnerTx } from "@/server/db/with-owner";

import { appendAudit } from "./audit";
import type { ServiceContext } from "./context";
import { notFoundError } from "./errors";
import { idempotentMutation } from "./mutation";
import { isoOrNull, setAsideRecordFromRow, type SetAsideRow } from "./records";
import { assertNotFuture } from "./rules";
import { assertSetAsideHistory, PENDING_CREATED_AT } from "./set-aside-rules";

export const SET_ASIDE_OPERATIONS = {
  create: "set_aside.create",
  delete: "set_aside.delete",
} as const;

const SET_ASIDE_NOT_FOUND = "That set-aside entry could not be found. It may have been deleted.";

function snapshotOf(row: SetAsideRow) {
  return { ...setAsideRecordFromRow(row), deletedAt: isoOrNull(row.deletedAt), deletedReason: row.deletedReason };
}

/** Active set-aside entries of one currency (owner-filtered; RLS backstop). */
async function activeEntries(tx: OwnerTx, ownerId: string, currency: string): Promise<SetAsideRecord[]> {
  const rows = await tx
    .select()
    .from(setAsideEntry)
    .where(
      and(eq(setAsideEntry.ownerId, ownerId), eq(setAsideEntry.currency, currency), isNull(setAsideEntry.deletedAt)),
    );
  return rows.map(setAsideRecordFromRow);
}

/**
 * Records money reserved for (or released from) the tithe. Date <= today. The running balance in canonical
 * order may never go negative (domain validateSetAsideHistory), else `limit_exceeded`. Reserving never changes
 * what is owed.
 */
export async function createSetAside(ctx: ServiceContext, raw: SetAsideCreateInput): Promise<IdResult> {
  return idempotentMutation(ctx, SET_ASIDE_OPERATIONS.create, setAsideCreateSchema, raw, async (m) => {
    const { data } = m;
    assertNotFuture(data.effectiveOn, m.today, "effectiveOn", "The date");

    const existing = await activeEntries(m.tx, m.ownerId, data.currency);
    const pending: SetAsideRecord = {
      id: "pending",
      currency: data.currency,
      kind: data.kind,
      amountMinor: data.amount,
      effectiveOn: data.effectiveOn,
      note: data.note,
      paymentId: null,
      createdAt: PENDING_CREATED_AT,
    };
    assertSetAsideHistory([...existing, pending], "amount");

    const [row] = await m.tx
      .insert(setAsideEntry)
      .values({
        ownerId: m.ownerId,
        currency: data.currency,
        kind: data.kind,
        amountMinor: data.amount,
        effectiveOn: data.effectiveOn,
        note: data.note,
        paymentId: null,
      })
      .returning();
    if (!row) throw new Error("set-aside insert returned no row");

    await appendAudit(m.tx, m.ownerId, {
      entityType: "set_aside",
      entityId: row.id,
      action: "create",
      after: snapshotOf(row),
    });
    return { id: row.id };
  });
}

/**
 * Soft-deletes a set-aside entry. Deleting a reserve that later releases depend on is rejected with
 * `limit_exceeded` (the balance would go negative). Idempotent: deleting a deleted entry succeeds.
 */
export async function deleteSetAside(ctx: ServiceContext, raw: SetAsideDeleteInput): Promise<IdResult> {
  return idempotentMutation(ctx, SET_ASIDE_OPERATIONS.delete, setAsideDeleteSchema, raw, async (m) => {
    const [row] = await m.tx
      .select()
      .from(setAsideEntry)
      .where(and(eq(setAsideEntry.ownerId, m.ownerId), eq(setAsideEntry.id, m.data.id)));
    if (!row) throw notFoundError(SET_ASIDE_NOT_FOUND);
    if (row.deletedAt !== null) return { id: row.id };

    const remaining = (await activeEntries(m.tx, m.ownerId, row.currency)).filter((r) => r.id !== row.id);
    assertSetAsideHistory(remaining, "id");

    const [deleted] = await m.tx
      .update(setAsideEntry)
      .set({ deletedAt: sql`now()`, deletedReason: m.data.reason })
      .where(and(eq(setAsideEntry.ownerId, m.ownerId), eq(setAsideEntry.id, row.id)))
      .returning();
    if (!deleted) throw notFoundError(SET_ASIDE_NOT_FOUND);

    await appendAudit(m.tx, m.ownerId, {
      entityType: "set_aside",
      entityId: row.id,
      action: "delete",
      before: snapshotOf(row),
      after: snapshotOf(deleted),
      reason: m.data.reason,
    });
    return { id: row.id };
  });
}
