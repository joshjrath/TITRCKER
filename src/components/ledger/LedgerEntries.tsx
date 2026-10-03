"use client";

import { useId, useState, type RefObject } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/components/ui";
import type { IncomeRowVM } from "@/lib/view-models";
import { LedgerFilters } from "./LedgerFilters";
import { LedgerList } from "./LedgerList";
import { LedgerNoMatches } from "./LedgerEmpty";
import { FilteredTotals } from "./LedgerSummary";
import { LedgerTable } from "./LedgerTable";
import { dateBounds, type CurrencyTotals, type LedgerViewState } from "./ledger-view";
import type { HighlightFor, LedgerRowActions } from "./row-types";

export interface LedgerEntriesProps {
  headingRef: RefObject<HTMLHeadingElement | null>;
  view: LedgerViewState;
  onViewChange: (patch: Partial<LedgerViewState>) => void;
  onReset: () => void;
  today: string;
  earliest: string;
  rows: readonly IncomeRowVM[];
  totalCount: number;
  totals: readonly CurrencyTotals[];
  filtered: boolean;
  actions: LedgerRowActions;
  highlightFor: HighlightFor;
}

function activeFilterCount(view: LedgerViewState): number {
  return [view.from !== "", view.to !== "", view.currency !== "all"].filter(Boolean).length;
}

/** The entries panel: filters, totals of what is shown, then the table (tablet/desktop) or rows (phone). */
export function LedgerEntries(props: LedgerEntriesProps) {
  const { headingRef, view, onViewChange, onReset, rows, totals, filtered, actions, highlightFor } = props;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const extra = activeFilterCount(view);

  return (
    <section aria-labelledby="ledger-entries" className="rounded-panel border border-line bg-surface">
      <div className="flex flex-col gap-4 px-4 pb-4 pt-5 md:px-5">
        <h2 id="ledger-entries" ref={headingRef} tabIndex={-1} className="sr-only">
          Income entries
        </h2>
        <LedgerFilters
          view={view}
          onChange={onViewChange}
          onReset={onReset}
          today={props.today}
          earliest={props.earliest}
          moreId={moreId}
          moreOpen={moreOpen}
          moreToggle={
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls={moreId}
              onClick={() => setMoreOpen((o) => !o)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-control border border-line-strong bg-surface-raised px-3 text-label font-medium text-text md:hidden",
                moreOpen && "border-line-input",
              )}
            >
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              Filters
              {extra > 0 ? <span className="tabular text-accent">({extra} on)</span> : null}
            </button>
          }
        />
      </div>

      <div className="border-t border-line px-4 py-3 md:px-5">
        <FilteredTotals totals={totals} shown={rows.length} total={props.totalCount} filtered={filtered} />
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-line">
          <LedgerNoMatches onReset={onReset} invertedRange={dateBounds(view).inverted} />
        </div>
      ) : (
        <>
          <LedgerTable
            rows={rows}
            actions={actions}
            highlightFor={highlightFor}
            sort={view.sort}
            onSort={(sort) => onViewChange({ sort })}
            className="hidden border-t border-line md:table"
          />
          <LedgerList rows={rows} actions={actions} highlightFor={highlightFor} className="border-t border-line md:hidden" />
        </>
      )}
    </section>
  );
}
