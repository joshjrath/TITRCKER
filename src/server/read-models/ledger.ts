import "server-only";

import { buildLedgerRows } from "@/domain";
import type { LedgerVM } from "@/lib/view-models";
import { withOwner } from "@/server/db/with-owner";
import type { ServiceContext } from "@/server/services/context";

import { categoriesOf, headlinesFrom, incomeRowVM, loadComputedLedgerTx } from "./common";

/** The income ledger: every active income entry (newest first) with its refunds and derived tithe. */
export async function getLedger(ctx: ServiceContext): Promise<LedgerVM> {
  const { snapshot, today, tracking, settings, balances } = await withOwner(ctx.ownerId, (tx) =>
    loadComputedLedgerTx(tx, ctx),
  );
  return {
    today,
    timeZone: tracking.timeZone,
    settings,
    rows: buildLedgerRows(snapshot).map(incomeRowVM),
    headlines: headlinesFrom(balances, today),
    categories: categoriesOf(snapshot),
  };
}
