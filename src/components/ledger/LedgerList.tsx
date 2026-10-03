"use client";

import { useId } from "react";
import { formatLocalDate } from "@/domain";
import { Amount, cn } from "@/components/ui";
import type { IncomeRowVM } from "@/lib/view-models";
import { AdjustmentList } from "./AdjustmentList";
import { CategoryChip, FullTextPanel, FullTextToggle, HighlightBadge, RowActionsMenu, SourceText } from "./RowParts";
import { useRowText } from "./use-overflow";
import type { HighlightFor, LedgerRowActions, RowHighlight } from "./row-types";

export interface LedgerListProps {
  rows: readonly IncomeRowVM[];
  actions: LedgerRowActions;
  highlightFor: HighlightFor;
  className?: string;
}

function LedgerListItem({ row, actions, highlight }: { row: IncomeRowVM; actions: LedgerRowActions; highlight: RowHighlight | null }) {
  const { sourceRef, noteRef, open, expandable, toggle } = useRowText(row.note);
  const detailId = `${useId()}-text`;
  return (
    <li className={cn("border-b border-line py-3 pl-4 pr-1 last:border-b-0", highlight?.className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="flex min-w-0 items-center gap-2">
            <span ref={sourceRef} className="truncate text-[0.9375rem] text-text">
              <SourceText row={row} />
            </span>
            <HighlightBadge highlight={highlight} />
          </p>
          <p className="mt-1 flex min-w-0 items-center gap-2 text-xs text-text-3">
            <time dateTime={row.receivedOn} className="tabular shrink-0">
              {formatLocalDate(row.receivedOn)}
            </time>
            <CategoryChip category={row.category} />
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end pt-0.5">
          <Amount minor={row.amountMinor} currency={row.currency} size="md" />
          <span className="mt-1 flex items-baseline gap-1 text-xs text-text-3">
            Tithe <Amount minor={row.titheMinor} currency={row.currency} size="xs" tone="accent" />
          </span>
        </div>
        <RowActionsMenu row={row} actions={actions} />
      </div>

      {row.note !== null || expandable ? (
        <div className="mt-1 flex min-w-0 items-center gap-2 pr-3 text-xs text-text-3">
          {row.note !== null ? (
            <span ref={noteRef} className={cn("min-w-0 truncate", open && "hidden")} data-sensitive>
              {row.note}
            </span>
          ) : null}
          {expandable ? <FullTextToggle row={row} open={open} controls={detailId} onToggle={toggle} /> : null}
        </div>
      ) : null}
      <div id={detailId} hidden={!open} className="pr-3">
        {open ? <FullTextPanel row={row} id={`${detailId}-panel`} className="mt-1.5 rounded-control bg-bg/50 px-3 py-2.5" /> : null}
      </div>
      <AdjustmentList row={row} onRemove={(id) => actions.removeAdjustment(row, id)} className="mr-3 mt-2.5" />
    </li>
  );
}

/** The ledger as organised rows on phones: source and date on top-left, amount and tithe right-aligned. */
export function LedgerList({ rows, actions, highlightFor, className }: LedgerListProps) {
  return (
    <ul className={className} aria-label="Income entries">
      {rows.map((row) => (
        <LedgerListItem key={row.id} row={row} actions={actions} highlight={highlightFor(row.id)} />
      ))}
    </ul>
  );
}
