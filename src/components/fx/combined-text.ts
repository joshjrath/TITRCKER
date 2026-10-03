import { formatLocalDate, formatMoney } from "@/domain";
import type { CombinedTotalVM } from "@/lib/view-models";

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
