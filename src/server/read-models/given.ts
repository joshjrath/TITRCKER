import "server-only";

import { and, desc, eq, isNotNull } from "drizzle-orm";

import { computePayoutStatus, CURRENCIES, subMinor, sumMinor, toMinor, type BucketPosition, type Currency } from "@/domain";
import type { GivenVM, PaymentVM } from "@/lib/view-models";
import { churchPayment, paymentAllocation, setAsideEntry } from "@/server/db/schema";
import { withOwner, type OwnerTx } from "@/server/db/with-owner";
import type { ServiceContext } from "@/server/services/context";
import { groupAllocations, isoOrNull, paymentRecordFromRow, type PaymentRow, type SetAsideRow } from "@/server/services/records";

import { currencyParam, headlinesFrom, loadComputedLedgerTx } from "./common";

export interface GivenParams {
  /** Selected currency ('CAD' | 'USD'); anything else falls back to the display currency. */
  currency?: string | null;
}

/**
 * The linked set-aside release still attached to a payment: the active one, or for a reversed payment the one
 * soft-deleted by that reversal (same transaction, so deleted_at equals reversed_at).
 */
function linkedReleaseMinor(payment: PaymentRow, releases: readonly SetAsideRow[]) {
  const linked = releases.filter(
    (r) =>
      r.paymentId === payment.id &&
      (r.deletedAt === null ||
        (payment.reversedAt !== null && r.deletedAt.getTime() === payment.reversedAt.getTime())),
  );
  return sumMinor(linked.map((r) => toMinor(r.amountMinor)));
}

/** Every payment of the owner (including reversed ones), newest first. */
export async function loadPaymentVMs(tx: OwnerTx, ownerId: string): Promise<PaymentVM[]> {
  const payments = await tx
    .select()
    .from(churchPayment)
    .where(eq(churchPayment.ownerId, ownerId))
    .orderBy(desc(churchPayment.paidOn), desc(churchPayment.createdAt), desc(churchPayment.id));
  if (payments.length === 0) return [];
  const allocations = groupAllocations(
    await tx.select().from(paymentAllocation).where(eq(paymentAllocation.ownerId, ownerId)),
  );
  const releases = await tx
    .select()
    .from(setAsideEntry)
    .where(and(eq(setAsideEntry.ownerId, ownerId), isNotNull(setAsideEntry.paymentId)));

  return payments.map((row): PaymentVM => {
    const record = paymentRecordFromRow(row, allocations.get(row.id) ?? []);
    const allocated = sumMinor(record.allocations.map((a) => a.amountMinor));
    return {
      id: record.id,
      currency: record.currency,
      amountMinor: record.amountMinor,
      paidOn: record.paidOn,
      churchName: record.churchName,
      reference: record.reference,
      note: record.note,
      createdAt: record.createdAt,
      version: record.version,
      allocations: record.allocations.map((a) => ({ bucketYear: a.bucketYear, amountMinor: a.amountMinor })),
      unallocatedMinor: subMinor(record.amountMinor, allocated),
      reversedAt: isoOrNull(row.reversedAt),
      reversalReason: row.reversalReason,
      linkedSetAsideMinor: linkedReleaseMinor(row, releases),
    };
  });
}

/** The Given page: payout status, balances and outstanding buckets per currency, and the payment history. */
export async function getGiven(ctx: ServiceContext, params: GivenParams = {}): Promise<GivenVM> {
  return withOwner(ctx.ownerId, async (tx) => {
    const ledger = await loadComputedLedgerTx(tx, ctx);
    const payments = await loadPaymentVMs(tx, ctx.ownerId);
    const bucketsByCurrency = Object.fromEntries(
      CURRENCIES.map((c) => [c, ledger.balances[c].buckets]),
    ) as Record<Currency, BucketPosition[]>;
    return {
      today: ledger.today,
      settings: ledger.settings,
      currency: currencyParam(params.currency, ledger.tracking.displayCurrency),
      payout: computePayoutStatus({
        today: ledger.today,
        plannedDate: ledger.tracking.nextPayoutDate,
        isDefaultDate: ledger.tracking.nextPayoutIsDefault,
        balances: ledger.balances,
        events: ledger.events,
      }),
      headlines: headlinesFrom(ledger.balances, ledger.today),
      bucketsByCurrency,
      payments,
    };
  });
}
