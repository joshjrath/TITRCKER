"use client";

import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import type { Currency } from "@/domain";
import { Button, DateInput, Field, IconButton, SegmentedControl, Select, TextInput, cn } from "@/components/ui";
import { SORT_OPTIONS, dateBounds, hasActiveFilters, type LedgerSortKey, type LedgerViewState } from "./ledger-view";

export interface LedgerFiltersProps {
  view: LedgerViewState;
  onChange: (patch: Partial<LedgerViewState>) => void;
  onReset: () => void;
  /** Today in the owner's time zone (latest selectable date). */
  today: string;
  /** Earliest selectable date (the tracking start). */
  earliest: string;
  /** Phones: id of the collapsible group (dates, currency, sort) and its toggle button. */
  moreId: string;
  moreOpen: boolean;
  moreToggle: ReactNode;
  className?: string;
}

const CURRENCY_OPTIONS: readonly { value: Currency | "all"; label: string; ariaLabel?: string }[] = [
  { value: "all", label: "All", ariaLabel: "All currencies" },
  { value: "CAD", label: "CAD" },
  { value: "USD", label: "USD" },
];

function sortKeyOf(value: string): LedgerSortKey {
  return SORT_OPTIONS.find((o) => o.value === value)?.value ?? "date_desc";
}

/**
 * Search, date range, currency and sort for the ledger. Everything stays in the browser (nothing goes in the URL).
 * On phones the search stays visible and the rest folds behind a "Filters" button.
 */
export function LedgerFilters({ view, onChange, onReset, today, earliest, moreId, moreOpen, moreToggle, className }: LedgerFiltersProps) {
  const { inverted } = dateBounds(view);
  return (
    <div role="search" aria-label="Filter the ledger" className={cn("flex flex-col gap-3 md:flex-row md:flex-wrap md:items-start", className)}>
      <div className="flex items-end gap-2 md:min-w-[15rem] md:flex-1">
        <Field label="Search" className="min-w-0 flex-1">
          <TextInput
            type="search"
            value={view.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Source, category or note"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            leading={<Search />}
            trailing={
              view.query !== "" ? (
                <IconButton aria-label="Clear search" size="sm" icon={<X />} onClick={() => onChange({ query: "" })} className="size-9 md:size-8" />
              ) : undefined
            }
            className="[&::-webkit-search-cancel-button]:hidden"
          />
        </Field>
        {moreToggle}
      </div>

      <div id={moreId} className={cn("flex-col gap-3 md:flex md:flex-row md:flex-wrap md:items-start", moreOpen ? "flex" : "hidden")}>
        <div className="grid grid-cols-2 gap-3 md:flex">
          <Field label="From">
            <DateInput
              value={view.from}
              min={earliest}
              max={view.to || today}
              onChange={(e) => onChange({ from: e.target.value })}
              className="w-full min-w-0 md:w-[10.25rem]"
            />
          </Field>
          <Field label="To" error={inverted ? "This is before the From date." : null}>
            <DateInput
              value={view.to}
              min={view.from || earliest}
              max={today}
              onChange={(e) => onChange({ to: e.target.value })}
              className="w-full min-w-0 md:w-[10.25rem]"
            />
          </Field>
        </div>
        <div className="flex items-start gap-3">
          <SegmentedControl
            label="Currency"
            hideLabel={false}
            options={CURRENCY_OPTIONS}
            value={view.currency}
            onChange={(currency) => onChange({ currency })}
            className="shrink-0"
          />
          <Field label="Sort" className="min-w-0 flex-1 md:w-[11rem] md:flex-none">
            <Select value={view.sort} onChange={(e) => onChange({ sort: sortKeyOf(e.target.value) })}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {hasActiveFilters(view) ? (
          <Button variant="ghost" onClick={onReset} leadingIcon={<X aria-hidden="true" className="size-4" />} className="self-start md:mt-[1.625rem]">
            Reset filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
