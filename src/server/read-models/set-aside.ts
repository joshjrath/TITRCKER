import "server-only";

import { CURRENCIES, setAsideHistory } from "@/domain";
import type { SetAsideVM } from "@/lib/view-models";
import { withOwnerSnapshot } from "@/server/db/with-owner";
import type { ServiceContext } from "@/server/services/context";

import { loadComputedLedgerTx } from "./common";

/** The Set aside page: balance, still to set aside and the chronological history (oldest first) per currency. */
export async function getSetAside(ctx: ServiceContext): Promise<SetAsideVM> {
  const { today, settings, snapshot, balances } = await withOwnerSnapshot(ctx.ownerId, (tx) => loadComputedLedgerTx(tx, ctx));
  return {
    today,
    settings,
    perCurrency: CURRENCIES.map((currency) => ({
      currency,
      balanceMinor: balances[currency].setAsideMinor,
      stillToGiveMinor: balances[currency].stillToGiveMinor,
      stillToSetAsideMinor: balances[currency].stillToSetAsideMinor,
      history: setAsideHistory(snapshot.setAsides, currency).map((entry) => ({
        id: entry.id,
        currency: entry.currency,
        kind: entry.kind,
        amountMinor: entry.amountMinor,
        effectiveOn: entry.effectiveOn,
        note: entry.note,
        paymentId: entry.paymentId,
        createdAt: entry.createdAt,
        runningBalanceMinor: entry.runningBalanceMinor,
      })),
    })),
  };
}
