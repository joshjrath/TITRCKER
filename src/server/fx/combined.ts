import "server-only";

import type { Currency, CurrencyBalance, FxRate } from "@/domain";
import { combinedStillToGiveFrom, fxRateVM } from "@/lib/combined-figures";
import type { CombinedTotalVM, FxRateVM } from "@/lib/view-models";

import { getUsdCadRate, type RateDeps } from "./rates";

/** True when the USD ledger has any activity (income, refunds, payments, openings, set-aside) or anything owed. */
export function usdHasActivity(balances: Record<Currency, CurrencyBalance>): boolean {
  return balances.USD.hasActivity || balances.USD.stillToGiveMinor !== 0;
}

/**
 * The USD→CAD display rate for a read model, looked up once and reused for every combined figure on the page.
 * Looks it up only when the USD ledger has activity, so a CAD-only owner never triggers an outbound request.
 * Call it OUTSIDE any database transaction (it may hit the network on the very first lookup).
 */
export async function displayRateFor(
  balances: Record<Currency, CurrencyBalance>,
  now: Date,
  deps: RateDeps = {},
): Promise<FxRateVM | null> {
  if (!usdHasActivity(balances)) return null;
  const rate: FxRate | null = await getUsdCadRate(now, deps);
  return rate ? fxRateVM(rate) : null;
}

/** Per-currency still to give. */
export function stillToGiveOf(balances: Record<Currency, CurrencyBalance>) {
  return { CAD: balances.CAD.stillToGiveMinor, USD: balances.USD.stillToGiveMinor };
}

/**
 * Builds the display-only combined total on its own (pages that need no other combined figure). Looks up the rate
 * only when something is owed in USD. Call it OUTSIDE any database transaction.
 */
export async function combinedStillToGive(
  balances: Record<Currency, CurrencyBalance>,
  now: Date,
  deps: RateDeps = {},
): Promise<CombinedTotalVM> {
  const owed = stillToGiveOf(balances);
  if (owed.USD === 0) return combinedStillToGiveFrom(owed, null);
  const rate = await getUsdCadRate(now, deps);
  return combinedStillToGiveFrom(owed, rate ? fxRateVM(rate) : null);
}
