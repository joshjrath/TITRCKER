import "server-only";

import { combineStillToGiveInCad, FX_SOURCE_LABELS, toMinor, type CurrencyBalance, type Currency } from "@/domain";
import type { CombinedTotalVM } from "@/lib/view-models";

import { getUsdCadRate, type RateDeps } from "./rates";

/**
 * Builds the display-only combined total. Looks up the exchange rate only when something is owed in USD, so a
 * CAD-only owner never triggers an outbound request. Call it OUTSIDE any database transaction.
 */
export async function combinedStillToGive(
  balances: Record<Currency, CurrencyBalance>,
  now: Date,
  deps: RateDeps = {},
): Promise<CombinedTotalVM> {
  const cadMinor = balances.CAD.stillToGiveMinor;
  const usdMinor = balances.USD.stillToGiveMinor;
  if (usdMinor === 0) {
    return { status: "cad_only", totalCadMinor: cadMinor, cadMinor, usdMinor, usdInCadMinor: toMinor(0), rate: null };
  }
  const rate = await getUsdCadRate(now, deps);
  const combined = combineStillToGiveInCad({ CAD: cadMinor, USD: usdMinor }, rate);
  if (!combined || !rate) {
    return { status: "unavailable", totalCadMinor: null, cadMinor, usdMinor, usdInCadMinor: null, rate: null };
  }
  return {
    status: "combined",
    totalCadMinor: combined.totalCadMinor,
    cadMinor,
    usdMinor,
    usdInCadMinor: combined.usdInCadMinor,
    rate: { value: rate.rate, observedOn: rate.observedOn, sourceLabel: FX_SOURCE_LABELS[rate.source], stale: rate.stale },
  };
}
