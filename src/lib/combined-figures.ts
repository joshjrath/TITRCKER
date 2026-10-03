/**
 * Display-only CAD views of per-currency figures (ARCHITECTURE §3.10): the combined still-to-give, the Overview's
 * period figures and the Ledger's filtered totals. Pure (no server or browser APIs), so the read models and client
 * components share it. Nothing here is stored, allocated or exported; CAD and USD stay separate everywhere else.
 */
import {
  combineAmountsInCad,
  FX_SOURCE_LABELS,
  periodHasActivity,
  toMinor,
  type Currency,
  type FxRate,
  type Minor,
  type PeriodSummary,
} from "@/domain";

import type { CombinedAmountVM, CombinedPeriodVM, CombinedTotalVM, FxRateVM } from "./view-models";

/** The rate as the UI shows it. */
export function fxRateVM(rate: FxRate): FxRateVM {
  return { value: rate.rate, observedOn: rate.observedOn, sourceLabel: FX_SOURCE_LABELS[rate.source], stale: rate.stale };
}

/** CAD as is plus USD converted at `rate`; null when there is USD to convert but no rate. */
export function combineInCad(amounts: Record<Currency, Minor>, rate: FxRateVM | null): CombinedAmountVM | null {
  return combineAmountsInCad(amounts, rate?.value ?? null);
}

/**
 * The combined "Total still to give in CAD". With nothing owed in USD it is the CAD amount and carries no rate;
 * with USD owed and no rate it is unavailable (never a guessed number).
 */
export function combinedStillToGiveFrom(stillToGive: Record<Currency, Minor>, rate: FxRateVM | null): CombinedTotalVM {
  const cadMinor = stillToGive.CAD;
  const usdMinor = stillToGive.USD;
  if (usdMinor === 0) {
    return { status: "cad_only", totalCadMinor: cadMinor, cadMinor, usdMinor, usdInCadMinor: toMinor(0), rate: null };
  }
  const combined = rate ? combineInCad(stillToGive, rate) : null;
  if (!combined || !rate) {
    return { status: "unavailable", totalCadMinor: null, cadMinor, usdMinor, usdInCadMinor: null, rate: null };
  }
  return { status: "combined", totalCadMinor: combined.totalCadMinor, cadMinor, usdMinor, usdInCadMinor: combined.usdInCadMinor, rate };
}

const SINGLE: CombinedPeriodVM = { status: "single_currency", incomeCad: null, accruedCad: null, givenCad: null, rate: null };

/**
 * The selected period's income received, tithe accrued and given, each in CAD, whenever the period has activity in
 * the currency that is NOT selected (both currencies, or only the other one), so the figures never leave out entries
 * the Ledger lists. Only the selected currency active (or nothing): `single_currency` (shown as they are).
 * USD to convert and no rate: `unavailable` (never a guessed number). `rate` is null when no USD needed converting.
 */
export function combinedPeriodFigures(
  summaries: Record<Currency, PeriodSummary>,
  rate: FxRateVM | null,
  selected: Currency,
): CombinedPeriodVM {
  const other: Currency = selected === "CAD" ? "USD" : "CAD";
  if (!periodHasActivity(summaries[other])) return SINGLE;
  const pick = (field: "netIncomeMinor" | "accruedMinor" | "givenMinor") =>
    combineInCad({ CAD: summaries.CAD[field], USD: summaries.USD[field] }, rate);
  const incomeCad = pick("netIncomeMinor");
  const accruedCad = pick("accruedMinor");
  const givenCad = pick("givenMinor");
  if (!incomeCad || !accruedCad || !givenCad) return { ...SINGLE, status: "unavailable" };
  const converted = incomeCad.usdMinor !== 0 || accruedCad.usdMinor !== 0 || givenCad.usdMinor !== 0;
  return { status: "combined", incomeCad, accruedCad, givenCad, rate: converted ? rate : null };
}
