"use client";

import { PencilLine, ReceiptText, Trash2 } from "lucide-react";
import { formatLocalDate, formatMoney } from "@/domain";
import { Badge, Menu, cn } from "@/components/ui";
import type { IncomeRowVM } from "@/lib/view-models";
import type { LedgerRowActions, RowHighlight } from "./row-types";

export function rowLabel(row: IncomeRowVM): string {
  const from = row.source ? ` from ${row.source}` : "";
  return `${formatMoney(row.amountMinor, row.currency)}${from} on ${formatLocalDate(row.receivedOn)}`;
}

export function SourceText({ row }: { row: IncomeRowVM }) {
  return row.source ? <>{row.source}</> : <span className="text-text-3">No source</span>;
}

export function HighlightBadge({ highlight }: { highlight: RowHighlight | null }) {
  return highlight ? (
    <Badge tone="accent" className="h-5 shrink-0 px-1.5">
      {highlight.label}
    </Badge>
  ) : null;
}

export function CategoryChip({
  category,
  decorative = false,
  className,
}: {
  category: string | null;
  /** Visual duplicate of text read elsewhere: hide it from assistive technology. */
  decorative?: boolean;
  className?: string;
}) {
  if (!category) return null;
  return (
    <Badge aria-hidden={decorative || undefined} className={cn("h-5 max-w-full min-w-0 shrink-0 px-1.5 font-normal", className)}>
      <span className="sr-only">Category: </span>
      <span className="truncate">{category}</span>
    </Badge>
  );
}

/** "Show note" / "Show full source" toggle for the row's full text panel (keyboard reachable, not hover). */
export function FullTextToggle({
  row,
  open,
  controls,
  onToggle,
}: {
  row: IncomeRowVM;
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const what = row.note !== null ? "note" : "full source";
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="inline-flex min-h-8 shrink-0 items-center rounded-[6px] px-1 text-xs font-medium text-accent hover:underline md:min-h-6"
    >
      {open ? `Hide ${what}` : `Show ${what}`}
      <span className="sr-only"> for {rowLabel(row)}</span>
    </button>
  );
}

/** The full source and note, wrapped (never truncated). */
export function FullTextPanel({ row, id, className }: { row: IncomeRowVM; id: string; className?: string }) {
  return (
    <dl id={id} className={cn("grid gap-x-4 gap-y-1.5 text-label sm:grid-cols-[6rem_1fr]", className)}>
      <dt className="text-text-3">Source</dt>
      <dd className="text-text [overflow-wrap:anywhere]">
        <SourceText row={row} />
      </dd>
      {row.note !== null ? (
        <>
          <dt className="text-text-3">Note</dt>
          <dd className="whitespace-pre-line text-text-2 [overflow-wrap:anywhere]">{row.note}</dd>
        </>
      ) : null}
    </dl>
  );
}

export function RowActionsMenu({ row, actions }: { row: IncomeRowVM; actions: LedgerRowActions }) {
  const fullyRefunded = row.refundableMinor <= 0;
  return (
    <Menu
      label={`Actions for ${rowLabel(row)}`}
      items={[
        { id: "edit", label: "Edit", icon: <PencilLine />, onSelect: () => actions.edit(row) },
        {
          id: "refund",
          label: fullyRefunded ? "Fully refunded" : "Refund or correction",
          icon: <ReceiptText />,
          disabled: fullyRefunded,
          onSelect: () => actions.refund(row),
        },
        "separator",
        { id: "delete", label: "Delete", icon: <Trash2 />, danger: true, onSelect: () => actions.remove(row) },
      ]}
    />
  );
}
