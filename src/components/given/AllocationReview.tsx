"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";

import { formatMoney, type BucketPosition, type Currency, type Minor } from "@/domain";
import { Amount, Field, TextInput, cn } from "@/components/ui";

import { openBuckets, periodShortLabel, splitDraftFrom, type AllocationPreview, type SplitDraft } from "./allocation-form";

export interface AllocationReviewProps {
  currency: Currency;
  /** Parsed payment amount, or null while the amount field is empty/invalid. */
  amountMinor: Minor | null;
  buckets: readonly BucketPosition[];
  preview: AllocationPreview | null;
  /** The user's split, or null for the suggested (oldest first) split. */
  split: SplitDraft | null;
  onSplitChange: (split: SplitDraft | null) => void;
  /** Form-level allocation error from the server. */
  error?: string;
  /** Per-period errors from the server, keyed by year. */
  lineErrors?: Readonly<Record<number, string>>;
  disabled?: boolean;
}

/**
 * "This payment covers: 2026 (Oct 3 – Dec 31): CAD 150.00", oldest first, with the remainder shown as credit.
 * "Adjust split" opens one amount field per outstanding period (validated live by the parent's preview).
 */
export function AllocationReview({
  currency,
  amountMinor,
  buckets,
  preview,
  split,
  onSplitChange,
  error,
  lineErrors = {},
  disabled,
}: AllocationReviewProps) {
  const headingId = useId();
  const splitId = useId();
  const open = openBuckets(buckets);
  const adjusting = split !== null;
  const canAdjust = amountMinor !== null && open.length > 0;
  const shownError = preview?.error ?? error;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-control border border-line bg-surface px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-label font-medium text-text-2">
          This payment covers
        </h3>
        {adjusting ? <span className="text-xs text-text-3">Your split</span> : <span className="text-xs text-text-3">Oldest first</span>}
      </div>

      <CoverageList currency={currency} amountMinor={amountMinor} preview={preview} />

      {shownError ? (
        <p role="alert" className="text-label text-danger">
          {shownError}
        </p>
      ) : null}

      {canAdjust ? (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <button
            type="button"
            aria-expanded={adjusting}
            aria-controls={splitId}
            disabled={disabled}
            onClick={() => onSplitChange(adjusting ? null : splitDraftFrom(preview?.lines ?? [], buckets))}
            className="inline-flex min-h-11 items-center gap-2 self-start rounded-control text-label font-medium text-accent hover:text-accent-hover md:min-h-8"
          >
            <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", adjusting && "rotate-180")} />
            {adjusting ? "Use the suggested split" : "Adjust split"}
          </button>
          {adjusting ? (
            <div id={splitId} className="flex flex-col gap-3">
              {open.map((bucket) => (
                <Field
                  key={bucket.year}
                  label={periodShortLabel(bucket)}
                  hint={`Outstanding ${formatMoney(bucket.outstandingMinor, currency)}`}
                  error={preview?.lineErrors[bucket.year] ?? lineErrors[bucket.year]}
                >
                  <TextInput
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={disabled}
                    value={split[bucket.year] ?? ""}
                    onChange={(e) => onSplitChange({ ...split, [bucket.year]: e.target.value })}
                    leading={<span className="text-xs font-medium">{currency}</span>}
                    className="tabular"
                  />
                </Field>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CoverageList({
  currency,
  amountMinor,
  preview,
}: {
  currency: Currency;
  amountMinor: Minor | null;
  preview: AllocationPreview | null;
}) {
  if (amountMinor === null || preview === null) {
    return <p className="text-[0.875rem] text-text-2">Enter an amount to see which periods it covers.</p>;
  }
  const rows = preview.lines;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rows.length === 0 && preview.totalOutstandingMinor === 0 ? (
        <li className="py-2 text-[0.875rem] text-text-2">Nothing is owed in {currency} right now.</li>
      ) : null}
      {rows.map((line) => (
        <li key={line.bucketYear} className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
          <span className="text-[0.875rem] text-text">{line.label}</span>
          <Amount minor={line.amountMinor} currency={currency} size="md" />
        </li>
      ))}
      {preview.creditMinor > 0 ? (
        <li className="flex items-baseline justify-between gap-3 py-2 last:pb-0">
          <span className="text-[0.875rem] text-text">Kept as credit</span>
          <Amount minor={preview.creditMinor} currency={currency} size="md" tone="positive" />
        </li>
      ) : null}
    </ul>
  );
}
