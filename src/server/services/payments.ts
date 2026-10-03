import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import {
  ALLOCATION_ERROR_MESSAGES,
  computeBalances,
  formatMoney,
  minMinor,
  proposeAllocation,
  validateAllocation,
  ZERO,
  type AllocationLine,
  type BucketPosition,
  type Currency,
  type Minor,
} from "@/domain";
import {
  paymentDetailsUpdateSchema,
  paymentRecordSchema,
  paymentReverseSchema,
  type PaymentDetailsUpdateInput,
  type PaymentRecordData,
  type PaymentRecordInput,
  type PaymentReverseInput,
} from "@/lib/validation";
import type { IdResult, PaymentMutationResult } from "@/lib/view-models";
import { churchPayment, paymentAllocation, setAsideEntry } from "@/server/db/schema";
import type { OwnerTx } from "@/server/db/with-owner";

import { appendAudit } from "./audit";
import type { ServiceContext } from "./context";
import { notFoundError, ServiceError, staleError, validationError } from "./errors";
import { idempotentMutation } from "./mutation";
import { isoOrNull, paymentRecordFromRow, setAsideRecordFromRow, type AllocationRow, type PaymentRow, type SetAsideRow } from "./records";
import { assertNotFuture } from "./rules";
import { maxReleaseOn } from "./set-aside-rules";
import { loadActiveSnapshot } from "./snapshot";
import { trackingSettingsFromRow } from "./settings";

export const PAYMENT_OPERATIONS = {
  record: "payment.record",
  reverse: "payment.reverse",
  updateDetails: "payment.update_details",
} as const;

const PAYMENT_NOT_FOUND = "That payment could not be found.";

async function findPayment(tx: OwnerTx, ownerId: string, id: string): Promise<PaymentRow | undefined> {
  const [row] = await tx
    .select()
    .from(churchPayment)
    .where(and(eq(churchPayment.ownerId, ownerId), eq(churchPayment.id, id)));
  return row;
}

async function allocationsOf(tx: OwnerTx, ownerId: string, paymentId: string): Promise<AllocationRow[]> {
  return tx
    .select()
    .from(paymentAllocation)
    .where(and(eq(paymentAllocation.ownerId, ownerId), eq(paymentAllocation.paymentId, paymentId)));
}

function paymentSnapshot(row: PaymentRow, allocations: readonly AllocationRow[]) {
  return {
    ...paymentRecordFromRow(row, allocations),
    reversedAt: isoOrNull(row.reversedAt),
    reversalReason: row.reversalReason,
  };
}

function setAsideSnapshot(row: SetAsideRow) {
  return { ...setAsideRecordFromRow(row), deletedAt: isoOrNull(row.deletedAt), deletedReason: row.deletedReason };
}

/** Field key for an allocation line (matches zod paths such as `allocations.0.amount`). */
function allocationFieldKey(lines: PaymentRecordData["allocations"], bucketYear: number | undefined): string {
  if (lines === "auto" || bucketYear === undefined) return "allocations";
  const index = lines.findIndex((line) => line.bucketYear === bucketYear);
  return index >= 0 ? `allocations.${index}.amount` : "allocations";
}

/**
 * Resolves the payment's allocation lines against the CURRENT bucket positions of its currency
 * (outstanding after credits), computed inside the locked transaction.
 */
function resolveAllocations(
  data: PaymentRecordData,
  buckets: readonly BucketPosition[],
): { allocations: AllocationLine[]; creditMinor: Minor } {
  if (data.allocations === "auto") return proposeAllocation(data.amount, buckets);

  const lines: AllocationLine[] = data.allocations.map((a) => ({ bucketYear: a.bucketYear, amountMinor: a.amount }));
  const check = validateAllocation(data.amount, lines, buckets);
  if (check.ok) return { allocations: lines, creditMinor: check.creditMinor };

  let message = ALLOCATION_ERROR_MESSAGES[check.error];
  const bucket = buckets.find((b) => b.year === check.bucketYear);
  if (check.error === "exceeds_bucket_outstanding" && bucket) {
    message = `Only ${formatMoney(bucket.outstandingMinor, data.currency)} is outstanding for ${bucket.year}.`;
  } else if (check.error === "unknown_bucket" && check.bucketYear !== undefined) {
    message = `Nothing is outstanding for ${check.bucketYear} in ${data.currency}.`;
  }
  const key = allocationFieldKey(data.allocations, check.bucketYear);
  throw validationError(key === "allocations" ? { allocations: message } : { [key]: message, allocations: message });
}

/**
 * Records a church payment made elsewhere (ARCHITECTURE §3.6):
 * - paid date <= today; `confirmMadePayment` must be true (schema);
 * - allocations: `'auto'` = oldest outstanding bucket first; an explicit split is validated against the current
 *   bucket positions (each line <= that bucket's outstanding, total <= payment);
 * - any unallocated remainder is credit and requires `confirmCredit`;
 * - `drawFromSetAside` adds a linked release of min(amount, set-aside available on the paid date) in the same
 *   transaction (the running set-aside balance can never go negative).
 */
export async function recordPayment(ctx: ServiceContext, raw: PaymentRecordInput): Promise<PaymentMutationResult> {
  return idempotentMutation(ctx, PAYMENT_OPERATIONS.record, paymentRecordSchema, raw, async (m) => {
    const { data } = m;
    assertNotFuture(data.paidOn, m.today, "paidOn", "The payment date");

    const snapshot = await loadActiveSnapshot(m.tx, m.ownerId);
    const { trackingStart } = trackingSettingsFromRow(m.settings);
    const balances = computeBalances(snapshot, trackingStart);
    const currency: Currency = data.currency;
    const { allocations, creditMinor } = resolveAllocations(data, balances[currency].buckets);

    if (creditMinor > 0 && !data.confirmCredit) {
      const message = `${formatMoney(creditMinor, currency)} of this payment is more than you owe right now. Confirm to keep it as credit.`;
      throw validationError({ confirmCredit: message }, message);
    }

    const [row] = await m.tx
      .insert(churchPayment)
      .values({
        ownerId: m.ownerId,
        currency,
        amountMinor: data.amount,
        paidOn: data.paidOn,
        churchName: data.churchName,
        reference: data.reference,
        note: data.note,
      })
      .returning();
    if (!row) throw new Error("payment insert returned no row");

    const allocationRows =
      allocations.length === 0
        ? []
        : await m.tx
            .insert(paymentAllocation)
            .values(
              allocations.map((a) => ({
                ownerId: m.ownerId,
                paymentId: row.id,
                currency,
                bucketYear: a.bucketYear,
                amountMinor: a.amountMinor,
              })),
            )
            .returning();

    await appendAudit(m.tx, m.ownerId, {
      entityType: "payment",
      entityId: row.id,
      action: "create",
      after: paymentSnapshot(row, allocationRows),
    });

    if (data.drawFromSetAside) {
      const available = maxReleaseOn(snapshot.setAsides, currency, data.paidOn);
      const releaseMinor = minMinor(data.amount, available);
      if (releaseMinor > ZERO) {
        const [release] = await m.tx
          .insert(setAsideEntry)
          .values({
            ownerId: m.ownerId,
            currency,
            kind: "release",
            amountMinor: releaseMinor,
            effectiveOn: data.paidOn,
            note: null,
            paymentId: row.id,
          })
          .returning();
        if (!release) throw new Error("set-aside release insert returned no row");
        await appendAudit(m.tx, m.ownerId, {
          entityType: "set_aside",
          entityId: release.id,
          action: "create",
          after: setAsideSnapshot(release),
        });
      }
    }

    return {
      id: row.id,
      allocations: allocations.map((a) => ({ bucketYear: a.bucketYear, amountMinor: a.amountMinor })),
      creditMinor,
    };
  });
}

/**
 * Reverses a payment (soft: reversed_at + required reason, audited). Its allocations stop counting and its linked
 * set-aside release (if any) is soft-deleted in the same transaction. Idempotent: reversing a reversed payment succeeds.
 */
export async function reversePayment(ctx: ServiceContext, raw: PaymentReverseInput): Promise<IdResult> {
  return idempotentMutation(ctx, PAYMENT_OPERATIONS.reverse, paymentReverseSchema, raw, async (m) => {
    const row = await findPayment(m.tx, m.ownerId, m.data.id);
    if (!row) throw notFoundError(PAYMENT_NOT_FOUND);
    if (row.reversedAt !== null) return { id: row.id };

    const allocations = await allocationsOf(m.tx, m.ownerId, row.id);
    const [updated] = await m.tx
      .update(churchPayment)
      .set({
        reversedAt: sql`now()`,
        reversalReason: m.data.reason,
        updatedAt: sql`now()`,
        version: sql`${churchPayment.version} + 1`,
      })
      .where(and(eq(churchPayment.ownerId, m.ownerId), eq(churchPayment.id, row.id), isNull(churchPayment.reversedAt)))
      .returning();
    if (!updated) throw notFoundError(PAYMENT_NOT_FOUND);

    await appendAudit(m.tx, m.ownerId, {
      entityType: "payment",
      entityId: row.id,
      action: "reverse",
      before: paymentSnapshot(row, allocations),
      after: paymentSnapshot(updated, allocations),
      reason: m.data.reason,
    });

    const linked = await m.tx
      .select()
      .from(setAsideEntry)
      .where(
        and(eq(setAsideEntry.ownerId, m.ownerId), eq(setAsideEntry.paymentId, row.id), isNull(setAsideEntry.deletedAt)),
      );
    for (const release of linked) {
      const [deleted] = await m.tx
        .update(setAsideEntry)
        .set({ deletedAt: sql`now()`, deletedReason: m.data.reason })
        .where(and(eq(setAsideEntry.ownerId, m.ownerId), eq(setAsideEntry.id, release.id)))
        .returning();
      if (!deleted) continue;
      await appendAudit(m.tx, m.ownerId, {
        entityType: "set_aside",
        entityId: release.id,
        action: "delete",
        before: setAsideSnapshot(release),
        after: setAsideSnapshot(deleted),
        reason: m.data.reason,
      });
    }
    return { id: row.id };
  });
}

/**
 * Edits a payment's church name, reference and note (amount, currency, date and allocations never change: reverse
 * and re-record instead). Optimistic concurrency via `expectedVersion`; an identical edit is a successful no-op.
 */
export async function updatePaymentDetails(ctx: ServiceContext, raw: PaymentDetailsUpdateInput): Promise<IdResult> {
  return idempotentMutation(ctx, PAYMENT_OPERATIONS.updateDetails, paymentDetailsUpdateSchema, raw, async (m) => {
    const { data } = m;
    const row = await findPayment(m.tx, m.ownerId, data.id);
    if (!row) throw notFoundError(PAYMENT_NOT_FOUND);
    if (row.reversedAt !== null) {
      throw new ServiceError("conflict", "This payment was reversed, so it can no longer be edited.");
    }
    const unchanged = row.churchName === data.churchName && row.reference === data.reference && row.note === data.note;
    if (unchanged) return { id: row.id };
    if (row.version !== data.expectedVersion) throw staleError();

    const [updated] = await m.tx
      .update(churchPayment)
      .set({
        churchName: data.churchName,
        reference: data.reference,
        note: data.note,
        updatedAt: sql`now()`,
        version: sql`${churchPayment.version} + 1`,
      })
      .where(
        and(
          eq(churchPayment.ownerId, m.ownerId),
          eq(churchPayment.id, row.id),
          eq(churchPayment.version, row.version),
          isNull(churchPayment.reversedAt),
        ),
      )
      .returning();
    if (!updated) throw staleError();

    const allocations = await allocationsOf(m.tx, m.ownerId, row.id);
    await appendAudit(m.tx, m.ownerId, {
      entityType: "payment",
      entityId: row.id,
      action: "update",
      before: paymentSnapshot(row, allocations),
      after: paymentSnapshot(updated, allocations),
    });
    return { id: row.id };
  });
}
