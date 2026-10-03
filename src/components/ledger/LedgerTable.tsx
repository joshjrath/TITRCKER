"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/components/ui";
import type { IncomeRowVM } from "@/lib/view-models";
import type { LedgerSortKey } from "./ledger-view";
import { LedgerTableRow } from "./LedgerTableRow";
import type { HighlightFor, LedgerRowActions } from "./row-types";

export interface LedgerTableProps {
  rows: readonly IncomeRowVM[];
  actions: LedgerRowActions;
  highlightFor: HighlightFor;
  sort: LedgerSortKey;
  onSort: (sort: LedgerSortKey) => void;
  className?: string;
}

interface SortSpec {
  label: string;
  /** Shorter visible label below 1200px (the full label stays for screen readers). */
  shortLabel?: string;
  desc: LedgerSortKey;
  asc: LedgerSortKey;
  /** Which direction a first click picks. */
  first: "asc" | "desc";
  ascText: string;
  descText: string;
}

const DATE: SortSpec = { label: "Date received", shortLabel: "Date", desc: "date_desc", asc: "date_asc", first: "desc", ascText: "oldest first", descText: "newest first" };
const SOURCE: SortSpec = { label: "Source", desc: "source_desc", asc: "source_asc", first: "asc", ascText: "A to Z", descText: "Z to A" };
const AMOUNT: SortSpec = { label: "Received", desc: "amount_desc", asc: "amount_asc", first: "desc", ascText: "smallest first", descText: "largest first" };

function SortHeader({ spec, sort, onSort, align = "left", className }: { spec: SortSpec; sort: LedgerSortKey; onSort: (s: LedgerSortKey) => void; align?: "left" | "right"; className?: string }) {
  const direction = sort === spec.asc ? "asc" : sort === spec.desc ? "desc" : null;
  const next = direction === null ? spec[spec.first] : direction === "asc" ? spec.desc : spec.asc;
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
  const state = direction === "asc" ? spec.ascText : direction === "desc" ? spec.descText : null;
  return (
    <th
      scope="col"
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}
      className={cn("py-1.5 font-medium", align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => onSort(next)}
        className={cn(
          "-mx-1.5 inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-[6px] px-1.5 hover:bg-surface-raised hover:text-text",
          direction ? "text-text-2" : "text-text-3",
          align === "right" && "flex-row-reverse",
        )}
      >
        {spec.shortLabel ? (
          <>
            <span aria-hidden="true" className="desk:hidden">
              {spec.shortLabel}
            </span>
            <span className="max-desk:sr-only">{spec.label}</span>
          </>
        ) : (
          spec.label
        )}
        <Icon aria-hidden="true" className={cn("size-3.5", direction ? "opacity-100" : "opacity-50")} />
        <span className="sr-only">{state ? `, sorted ${state}` : ", sort"}</span>
      </button>
    </th>
  );
}

/** The ledger as a table (tablet and desktop). Each entry is its own <tbody> with its refunds underneath. */
export function LedgerTable({ rows, actions, highlightFor, sort, onSort, className }: LedgerTableProps) {
  return (
    <table className={cn("w-full table-fixed text-[0.875rem]", className)}>
      <caption className="sr-only">
        Income entries with the 10% tithe of each. Refunds and corrections are listed under their entry. Column headers sort the
        table.
      </caption>
      <thead>
        <tr className="border-b border-line text-left text-xs">
          <SortHeader spec={DATE} sort={sort} onSort={onSort} className="w-[7.25rem] pl-5 pr-3 desk:w-[8.25rem]" />
          <SortHeader spec={SOURCE} sort={sort} onSort={onSort} className="px-3" />
          <SortHeader spec={AMOUNT} sort={sort} onSort={onSort} align="right" className="w-[8.75rem] px-3 desk:w-[10.5rem]" />
          <th scope="col" className="w-[7.75rem] px-3 py-1.5 text-right font-medium text-text-3 desk:w-[9.5rem]">
            Tithe (10%)
          </th>
          {/* Below 1200px the category moves under the source; the column stays (zero width) so every row keeps 6 cells. */}
          <th scope="col" className="w-0 overflow-hidden p-0 font-medium text-text-3 desk:w-[10rem] desk:px-3 desk:py-1.5">
            <span className="max-desk:sr-only">Category</span>
          </th>
          <th scope="col" className="w-14 py-1.5 pr-3">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      {rows.map((row) => (
        <LedgerTableRow key={row.id} row={row} actions={actions} highlight={highlightFor(row.id)} />
      ))}
    </table>
  );
}
