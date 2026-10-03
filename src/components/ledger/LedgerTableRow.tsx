"use client";

import { useId } from "react";
import { formatLocalDate } from "@/domain";
import { Amount, cn } from "@/components/ui";
import type { IncomeRowVM } from "@/lib/view-models";
import { AdjustmentList } from "./AdjustmentList";
import { CategoryChip, FullTextPanel, FullTextToggle, HighlightBadge, RowActionsMenu, SourceText } from "./RowParts";
import { useRowText } from "./use-overflow";
import type { LedgerRowActions, RowHighlight } from "./row-types";

export interface LedgerTableRowProps {
  row: IncomeRowVM;
  actions: LedgerRowActions;
  highlight: RowHighlight | null;
}

/** One income entry as a <tbody>: the main row, then (optionally) its full text and its refunds. */
export function LedgerTableRow({ row, actions, highlight }: LedgerTableRowProps) {
  const { sourceRef, noteRef, open, expandable, toggle } = useRowText(row.note);
  const detailId = `${useId()}-text`;
  const hl = highlight?.className;
  const hasAdjustments = row.adjustments.length > 0;
  const subRow = "border-0";
  // Indented to the source column (date column width + cell padding), clear of the actions column.
  const subCell = "pb-3 pl-[8rem] pr-14 desk:pl-[9rem]";

  return (
    <tbody className="border-b border-line last:border-b-0">
      <tr className={cn("align-top", hl)}>
        <td className="tabular whitespace-nowrap py-3 pl-5 pr-3 text-text-2 max-desk:text-label">
          <time dateTime={row.receivedOn}>{formatLocalDate(row.receivedOn)}</time>
        </td>
        <td className="min-w-0 px-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span ref={sourceRef} className="truncate text-text">
              <SourceText row={row} />
            </span>
            <HighlightBadge highlight={highlight} />
          </div>
          {row.note !== null || expandable || row.category ? (
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-text-3">
              <CategoryChip category={row.category} decorative className="max-w-[45%] desk:hidden" />
              {row.note !== null ? (
                <span ref={noteRef} className={cn("min-w-0 truncate", open && "hidden")} data-sensitive>
                  {row.note}
                </span>
              ) : null}
              {expandable ? <FullTextToggle row={row} open={open} controls={detailId} onToggle={toggle} /> : null}
            </div>
          ) : null}
        </td>
        <td className="px-3 py-3 text-right">
          <Amount minor={row.amountMinor} currency={row.currency} size="sm" />
        </td>
        <td className="px-3 py-3 text-right">
          <Amount minor={row.titheMinor} currency={row.currency} size="sm" tone="accent" />
        </td>
        <td className="w-0 overflow-hidden p-0 desk:px-3 desk:py-3">
          <span className="max-desk:sr-only">
            {row.category ? <CategoryChip category={row.category} /> : <span className="text-text-3">—<span className="sr-only">No category</span></span>}
          </span>
        </td>
        <td className="py-1.5 pr-3 text-right">
          <RowActionsMenu row={row} actions={actions} />
        </td>
      </tr>
      <tr id={detailId} hidden={!open} className={cn(subRow, hl)}>
        <td colSpan={6} className={subCell}>
          {open ? <FullTextPanel row={row} id={`${detailId}-panel`} className="rounded-control bg-bg/50 px-3 py-2.5" /> : null}
        </td>
      </tr>
      {hasAdjustments ? (
        <tr className={cn(subRow, hl)}>
          <td colSpan={6} className={subCell}>
            <AdjustmentList row={row} onRemove={(id) => actions.removeAdjustment(row, id)} />
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}
