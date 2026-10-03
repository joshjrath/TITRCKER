"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatLocalDate } from "@/domain";
import { useSavedIncomeHighlight } from "@/components/app/IncomeEntryProvider";
import { AddIncomeButton } from "@/components/app/AddIncomeButton";
import { Amount, Badge, cn } from "@/components/ui";
import type { IncomeRowVM } from "@/lib/view-models";

export interface RecentEntriesProps {
  rows: readonly IncomeRowVM[];
  className?: string;
}

function SourceText({ row }: { row: IncomeRowVM }) {
  return row.source ? <>{row.source}</> : <span className="text-text-3">No source</span>;
}

function SavedBadge({ show }: { show: boolean }) {
  return show ? (
    <Badge tone="accent" className="ml-2 h-5 px-1.5">
      Saved
    </Badge>
  ) : null;
}

function RefundNote({ row }: { row: IncomeRowVM }) {
  if (row.refundedMinor <= 0) return null;
  return (
    <span className="mt-0.5 flex items-baseline justify-end gap-1 text-xs text-text-3">
      refunded <Amount minor={row.refundedMinor} currency={row.currency} size="xs" tone="muted" />
    </span>
  );
}

/** Newest income entries: a compact table from 768px, organised rows on phones. The newly saved row highlights. */
export function RecentEntries({ rows, className }: RecentEntriesProps) {
  const highlightClass = useSavedIncomeHighlight();
  return (
    <section aria-labelledby="recent-heading" className={cn("rounded-panel border border-line bg-surface", className)}>
      <header className="flex items-center justify-between gap-4 px-5 pb-3 pt-5 md:px-6">
        <h2 id="recent-heading" className="text-[0.9375rem] font-medium text-text">
          Recent entries
        </h2>
        <Link
          href="/ledger"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-control text-label font-medium text-accent hover:underline md:min-h-0"
        >
          View full ledger <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-5 pb-6 md:px-6">
          <p className="text-text-2">No income recorded yet.</p>
          <AddIncomeButton variant="secondary" size="sm" />
        </div>
      ) : (
        <>
          <table className="hidden w-full text-[0.875rem] md:table">
            <caption className="sr-only">Newest {rows.length} income entries. The tithe is 10% of each entry.</caption>
            <thead>
              <tr className="border-y border-line text-left text-xs text-text-3">
                <th scope="col" className="py-2.5 pl-6 pr-3 font-medium">Date received</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Source</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Received</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Tithe (10%)</th>
                <th scope="col" className="py-2.5 pl-3 pr-6 font-medium">Category</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const hl = highlightClass(row.id);
                return (
                  <tr key={row.id} className={cn("border-b border-line last:border-b-0", hl)}>
                    <td className="tabular whitespace-nowrap py-3 pl-6 pr-3 text-text-2">
                      <time dateTime={row.receivedOn}>{formatLocalDate(row.receivedOn)}</time>
                    </td>
                    <td className="max-w-[16rem] px-3 py-3 text-text">
                      <span className="truncate">
                        <SourceText row={row} />
                      </span>
                      <SavedBadge show={hl !== ""} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Amount minor={row.amountMinor} currency={row.currency} size="sm" />
                      <RefundNote row={row} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Amount minor={row.netTitheMinor} currency={row.currency} size="sm" tone="accent" />
                    </td>
                    <td className="py-3 pl-3 pr-6 text-text-2">{row.category ?? <span className="text-text-3">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <ul className="border-t border-line md:hidden">
            {rows.map((row) => {
              const hl = highlightClass(row.id);
              return (
                <li key={row.id} className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-3.5 last:border-b-0", hl)}>
                  <div className="min-w-0">
                    <p className="truncate text-[0.9375rem] text-text">
                      <SourceText row={row} />
                      <SavedBadge show={hl !== ""} />
                    </p>
                    <p className="mt-0.5 text-xs text-text-3">
                      <time dateTime={row.receivedOn}>{formatLocalDate(row.receivedOn)}</time>
                      {row.category ? ` · ${row.category}` : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <Amount minor={row.amountMinor} currency={row.currency} size="md" />
                    <span className="mt-0.5 flex items-baseline gap-1 text-xs text-text-3">
                      Tithe <Amount minor={row.netTitheMinor} currency={row.currency} size="xs" tone="accent" />
                    </span>
                    <RefundNote row={row} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
