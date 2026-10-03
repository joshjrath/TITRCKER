import { Amount, InlineAlert, cn } from "@/components/ui";
import type { CombinedTotalVM } from "@/lib/view-models";

import { combinedOneLiner, rateLine } from "./combined-text";

/**
 * The separate currencies under the combined CAD total: "CAD still to give" and "USD still to give ≈ CAD …",
 * followed by the rate, its source and date. CAD and USD are never summed here; the sum is the figure above.
 */
export function CombinedBreakdown({ combined, className }: { combined: CombinedTotalVM; className?: string }) {
  const rate = rateLine(combined);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <dl className="grid w-full max-w-md grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1.5 text-label">
        <dt className="text-text-2">CAD still to give</dt>
        <dd className="text-right">
          <Amount minor={combined.cadMinor} currency="CAD" size="sm" />
        </dd>
        <dt className="text-text-2">USD still to give</dt>
        <dd className="text-right">
          <Amount minor={combined.usdMinor} currency="USD" size="sm" />
          {combined.status === "combined" && combined.usdInCadMinor !== null && combined.usdMinor > 0 ? (
            <span className="ml-2 text-text-3">
              ≈ <Amount minor={combined.usdInCadMinor} currency="CAD" size="sm" tone="muted" />
            </span>
          ) : null}
        </dd>
      </dl>
      {rate ? (
        <p className={cn("text-xs", combined.rate?.stale ? "text-copper" : "text-text-3")}>{rate}</p>
      ) : null}
      {combined.status === "unavailable" ? (
        <InlineAlert tone="warning" className="mt-1 max-w-md">
          Combined CAD total unavailable right now — the exchange-rate service couldn&apos;t be reached. CAD and USD are
          shown separately.
        </InlineAlert>
      ) : null}
    </div>
  );
}

/** One quiet line for page headers ("Total ≈ CAD 163.50 (USD at 1.3500, Oct 2)"); renders nothing otherwise. */
export function CombinedTotalLine({ combined, className }: { combined: CombinedTotalVM; className?: string }) {
  const text = combinedOneLiner(combined);
  if (!text) return null;
  return (
    <p className={cn("tabular text-label text-text-2", className)} data-sensitive>
      {text}
    </p>
  );
}
