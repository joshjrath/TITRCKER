import { formatLocalDate, formatMoney } from "@/domain";
import type { CombinedAmountVM, CombinedTotalVM, FxRateVM } from "@/lib/view-models";

/** "USD→CAD 1.3712 · Bank of Canada · Oct 2, 2026" (plus a stale marker when the providers were unreachable). */
export function rateLine(combined: CombinedTotalVM): string | null {
  if (!combined.rate) return null;
  const { value, sourceLabel, observedOn, stale } = combined.rate;
  const base = `USD→CAD ${value} · ${sourceLabel} · ${formatLocalDate(observedOn)}`;
  return stale ? `${base} · last available rate` : `${base} · updates daily`;
}

/** What a screen reader hears for the combined total. */
export function spokenCombined(combined: CombinedTotalVM): string {
  if (combined.status !== "combined" || combined.totalCadMinor === null || combined.usdInCadMinor === null) return "";
  const rate = combined.rate ? ` converted at ${combined.rate.value}` : "";
  return `approximately ${formatMoney(combined.totalCadMinor, "CAD")} in total, including ${formatMoney(combined.usdMinor, "USD")}${rate}`;
}

/** Compact one-liner for the Ledger and Given headers, or null when there is nothing to combine. */
export function combinedOneLiner(combined: CombinedTotalVM): string | null {
  if (combined.status !== "combined" || combined.totalCadMinor === null || !combined.rate) return null;
  return `Total ≈ ${formatMoney(combined.totalCadMinor, "CAD")} (USD at ${combined.rate.value}, ${formatLocalDate(combined.rate.observedOn, "short")})`;
}

/** The separate amounts behind a combined figure: "CAD 5,203.00 · USD 1,750.00". */
export function combinedPartsText(amount: CombinedAmountVM): string {
  return `${formatMoney(amount.cadMinor, "CAD")} · ${formatMoney(amount.usdMinor, "USD")}`;
}

/** True when a combined figure includes converted USD (and so is approximate). */
export function isApproximate(amount: CombinedAmountVM): boolean {
  return amount.usdMinor !== 0;
}

/** What a screen reader hears for a combined period figure. */
export function spokenCombinedAmount(amount: CombinedAmountVM, rate: FxRateVM | null): string {
  if (!isApproximate(amount) || !rate) return `${formatMoney(amount.totalCadMinor, "CAD")} in CAD, nothing in USD`;
  return `approximately ${formatMoney(amount.totalCadMinor, "CAD")} in CAD, including ${formatMoney(amount.usdMinor, "USD")} converted at ${rate.value}`;
}

/** The note under combined period figures: "≈ CAD totals include USD converted at 1.4145 (Bank of Canada, Sep 25)". */
export function combinedRateNote(rate: FxRateVM): string {
  const base = `≈ CAD totals include USD converted at ${rate.value} (${rate.sourceLabel}, ${formatLocalDate(rate.observedOn, "short")})`;
  return rate.stale ? `${base} · last available rate` : base;
}

/** Which currency the charts below use, since the figures above combine both. */
export function chartCurrencyNote(currency: "CAD" | "USD"): string {
  return `The charts and monthly breakdown show ${currency} only.`;
}

export interface LedgerCombinedTotals {
  received: CombinedAmountVM;
  refunded: CombinedAmountVM;
  tithe: CombinedAmountVM;
}

/**
 * The pieces of the Ledger's combined line, each kept on one line when it wraps:
 * ["Total ≈ CAD 7,678.38 received", "≈ CAD 767.84 tithe (USD at 1.4145)"].
 */
export function ledgerCombinedSegments(totals: LedgerCombinedTotals, rate: FxRateVM): string[] {
  // ≈ only on a part that includes converted USD (a CAD-only refund total is exact).
  const amount = (a: CombinedAmountVM) => `${isApproximate(a) ? "≈ " : ""}${formatMoney(a.totalCadMinor, "CAD")}`;
  const parts = [`Total ${amount(totals.received)} received`];
  const refunds = totals.refunded.cadMinor !== 0 || totals.refunded.usdMinor !== 0;
  if (refunds) parts.push(`${amount(totals.refunded)} refunded`);
  parts.push(`${amount(totals.tithe)} ${refunds ? "tithe after refunds" : "tithe"}`);
  parts.push(`(USD at ${rate.value})`);
  return parts;
}

/** "Total ≈ CAD 7,678.38 received · ≈ CAD 767.84 tithe (USD at 1.4145)" for the Ledger's filtered totals. */
export function ledgerCombinedLine(totals: LedgerCombinedTotals, rate: FxRateVM): string {
  const parts = ledgerCombinedSegments(totals, rate);
  const suffix = parts.pop();
  return `${parts.join(" · ")} ${suffix}`;
}
