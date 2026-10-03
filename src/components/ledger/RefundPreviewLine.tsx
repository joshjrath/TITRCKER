import { Amount } from "@/components/ui";
import type { IncomeRowVM } from "@/lib/view-models";
import type { RefundPreview } from "./adjustment-effects";

/** Live "what this does to the tithe" box for the refund form (described-by the amount input, not a live region). */
export function RefundPreviewLine({ id, row, preview }: { id: string; row: IncomeRowVM; preview: RefundPreview }) {
  return (
    <div id={id} className="rounded-control border border-line bg-bg/40 px-4 py-3 text-label text-text-2">
      {preview.status === "ok" ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt>Tithe change</dt>
          <dd className="text-right">
            {preview.titheChangeMinor === 0 ? (
              <span className="text-text">No change</span>
            ) : (
              <Amount minor={preview.titheChangeMinor} currency={row.currency} size="sm" tone="accent" />
            )}
          </dd>
          <dt>This entry&apos;s tithe</dt>
          <dd className="flex items-baseline justify-end gap-1.5">
            <Amount minor={row.netTitheMinor} currency={row.currency} size="sm" tone="muted" />
            <span aria-hidden="true">→</span>
            <span className="sr-only">becomes</span>
            <Amount minor={preview.netTitheAfterMinor} currency={row.currency} size="sm" />
          </dd>
          <dt>Received after refunds</dt>
          <dd className="text-right">
            <Amount minor={preview.netAmountAfterMinor} currency={row.currency} size="sm" />
          </dd>
        </dl>
      ) : (
        <p>
          {preview.status === "empty"
            ? "Enter an amount to see the tithe change. The tithe is always 10% of what is left after refunds."
            : preview.message}
        </p>
      )}
    </div>
  );
}
