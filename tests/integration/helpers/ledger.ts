import { computeBalances, type Currency } from "@/domain";
import type { PaymentRecordInput } from "@/lib/validation";
import { createIncome } from "@/server/services/income";
import { recordPayment } from "@/server/services/payments";
import { loadOwnerLedger } from "@/server/services/snapshot";

import { ctxFor, key, noonToronto } from "./services";

/** Records income dated `receivedOn`, with the clock at noon (Toronto) on `today` (default: the received date). */
export function addIncome(owner: string, amount: string, receivedOn: string, opts: { currency?: Currency; today?: string } = {}) {
  return createIncome(ctxFor(owner, noonToronto(opts.today ?? receivedOn)), {
    idempotencyKey: key(),
    amount,
    currency: opts.currency ?? "CAD",
    receivedOn,
  });
}

/** Records a church payment dated `paidOn` (auto allocation unless given), clock at noon on `today` (default paidOn). */
export function pay(
  owner: string,
  amount: string,
  paidOn: string,
  extra: Partial<PaymentRecordInput> & { today?: string } = {},
) {
  const { today, ...rest } = extra;
  return recordPayment(ctxFor(owner, noonToronto(today ?? paidOn)), {
    idempotencyKey: key(),
    amount,
    currency: "CAD",
    paidOn,
    churchName: "Grace Church",
    allocations: "auto",
    confirmCredit: false,
    confirmMadePayment: true,
    drawFromSetAside: false,
    ...rest,
  });
}

/** Domain balances of the owner's active records. */
export async function balancesFor(owner: string, today = "2026-10-10") {
  const ledger = await loadOwnerLedger(ctxFor(owner, noonToronto(today)));
  return computeBalances(ledger.snapshot, ledger.tracking.trackingStart);
}

/** year -> { accrued, allocated, creditApplied, outstanding } for one currency. */
export async function bucketsFor(owner: string, currency: Currency = "CAD", today = "2026-10-10") {
  const balances = await balancesFor(owner, today);
  return Object.fromEntries(
    balances[currency].buckets.map((b) => [
      b.year,
      { accrued: b.accruedMinor, allocated: b.allocatedMinor, creditApplied: b.creditAppliedMinor, outstanding: b.outstandingMinor },
    ]),
  );
}
