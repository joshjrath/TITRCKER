import "server-only";

import { buildLedgerRows } from "@/domain";
import type { LedgerVM } from "@/lib/view-models";
import { withOwnerSnapshot } from "@/server/db/with-owner";
import { combinedStillToGiveFrom } from "@/lib/combined-figures";
import { displayRateFor, stillToGiveOf } from "@/server/fx/combined";
import type { ServiceContext } from "@/server/services/context";

import { categoriesOf, headlinesFrom, incomeRowVM, loadComputedLedgerTx } from "./common";

/** The income ledger: every active income entry (newest first) with its refunds and derived tithe. */
export async function getLedger(ctx: ServiceContext): Promise<LedgerVM> {
  const { snapshot, today, tracking, settings, balances } = await withOwnerSnapshot(ctx.ownerId, (tx) =>
    loadComputedLedgerTx(tx, ctx),
  );
  // The rate lookup may hit the network, so it runs after the read transaction, once for the whole page.
  const rate = await displayRateFor(balances, ctx.now);
  return {
    today,
    timeZone: tracking.timeZone,
    settings,
    rows: buildLedgerRows(snapshot).map(incomeRowVM),
    headlines: headlinesFrom(balances, today),
    categories: categoriesOf(snapshot),
    combined: combinedStillToGiveFrom(stillToGiveOf(balances), rate),
    displayRate: rate,
  };
}
