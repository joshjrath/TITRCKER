"use client";

import { formatLocalDate, formatMoney, negMinor } from "@/domain";
import { Amount, cn } from "@/components/ui";
import type { IncomeRowVM } from "@/lib/view-models";
import { netSummaryText } from "./adjustment-effects";

const KIND_LABEL = { refund: "Refund", correction: "Correction" } as const;

export interface AdjustmentListProps {
  row: IncomeRowVM;
  onRemove: (adjustmentId: string) => void;
  className?: string;
}

/** The refunds/corrections linked to one income entry, with the entry's net figures. */
export function AdjustmentList({ row, onRemove, className }: AdjustmentListProps) {
  if (row.adjustments.length === 0) return null;
  return (
    <div className={cn("border-l-2 border-copper/40 pl-3", className)}>
      <p className="tabular text-label font-medium text-text-2" data-sensitive>
        {netSummaryText(row)}
      </p>
      <ul className="mt-1 flex flex-col" aria-label={`Refunds and corrections for this entry`}>
        {row.adjustments.map((a) => {
          const kind = KIND_LABEL[a.kind];
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-0.5 text-xs text-text-2">
              <span className="font-medium text-text">{kind}</span>
              <time dateTime={a.effectiveOn} className="tabular">
                {formatLocalDate(a.effectiveOn)}
              </time>
              <Amount minor={negMinor(a.amountMinor)} currency={row.currency} size="xs" />
              <span className="inline-flex items-baseline gap-1">
                {a.titheDeltaMinor === 0 ? (
                  "no tithe change"
                ) : (
                  <>
                    tithe <Amount minor={a.titheDeltaMinor} currency={row.currency} size="xs" tone="accent" />
                  </>
                )}
              </span>
              <span className="min-w-0 max-w-full text-text-3 [overflow-wrap:anywhere]">
                <span className="sr-only">Reason: </span>“{a.reason}”
              </span>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                className="inline-flex min-h-8 items-center rounded-[6px] px-1 font-medium text-text-2 underline decoration-line-input underline-offset-2 hover:text-danger md:min-h-6"
              >
                Remove
                <span className="sr-only">
                  {" "}
                  {kind.toLowerCase()} of {formatMoney(a.amountMinor, row.currency)} from {formatLocalDate(a.effectiveOn)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
