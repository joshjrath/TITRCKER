"use client";

import { SearchX } from "lucide-react";
import { computeTithe, formatMoney, toMinor } from "@/domain";
import { AddIncomeButton } from "@/components/app/AddIncomeButton";
import { Button, EmptyState } from "@/components/ui";

const EXAMPLE_MINOR = toMinor(175_000);

/** No income recorded at all. */
export function LedgerEmpty() {
  return (
    <EmptyState
      title="No income recorded yet"
      description="Every amount you receive appears here with its 10% tithe. You can search, refund, correct and export entries from this page."
      action={<AddIncomeButton />}
      aside={
        <span className="tabular">
          Example: {formatMoney(EXAMPLE_MINOR, "CAD")} <span aria-hidden="true">→</span>
          <span className="sr-only">gives</span> {formatMoney(computeTithe(EXAMPLE_MINOR), "CAD")} tithe
        </span>
      }
    />
  );
}

/** Entries exist but the filters hide all of them. */
export function LedgerNoMatches({ onReset, invertedRange }: { onReset: () => void; invertedRange: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3 px-5 py-10 md:items-center md:px-6 md:text-center">
      <SearchX aria-hidden="true" className="size-6 text-text-3" />
      <h3 className="text-[0.9375rem] font-medium text-text">No entries match these filters</h3>
      <p className="max-w-prose text-label text-text-2">
        {invertedRange
          ? "The From date is after the To date. Change one of them, or reset the filters."
          : "Try a shorter search, a wider date range or All currencies."}
      </p>
      <Button variant="secondary" size="sm" onClick={onReset}>
        Reset filters
      </Button>
    </div>
  );
}
