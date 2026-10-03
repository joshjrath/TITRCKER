import type { ReactNode } from "react";

import { formatMoney, type BucketPosition, type Currency, type Minor } from "@/domain";
import { Amount } from "@/components/ui";
import { overCoveredNote } from "./obligation-text";

export interface OutstandingObligationsProps {
  currency: Currency;
  buckets: readonly BucketPosition[];
  stillToGiveMinor: Minor;
  creditMinor: Minor;
}

/**
 * "All outstanding obligations" for one currency: every period with something still owed, oldest first,
 * with what accrued, what payments covered, the credit applied and what is outstanding. Opening balances
 * are labelled "Opening balance" (never income); credit and over-covered periods read as credit.
 */
export function OutstandingObligations({ currency, buckets, stillToGiveMinor, creditMinor }: OutstandingObligationsProps) {
  const open = buckets.filter((b) => b.outstandingMinor > 0).sort((a, b) => a.year - b.year);
  const overCovered = buckets.filter((b) => b.overCoveredMinor > 0).sort((a, b) => a.year - b.year);

  return (
    <section aria-labelledby="obligations-title" className="flex flex-col gap-4 rounded-panel-lg border border-line bg-surface p-5 md:p-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 id="obligations-title" className="text-lg font-medium text-text">
            All outstanding obligations
          </h2>
          <p className="text-label text-text-3">{currency} · oldest first</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-3">Total</p>
          <Amount minor={stillToGiveMinor} currency={currency} size="md" />
        </div>
      </header>

      {open.length === 0 ? (
        <p className="text-[0.9375rem] text-text-2">Nothing outstanding in {currency}. Every period is covered.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line border-t border-line">
          {open.map((bucket) => (
            <BucketItem key={bucket.year} bucket={bucket} currency={currency} />
          ))}
        </ol>
      )}

      {creditMinor > 0 ? (
        <p className="rounded-control border border-positive/25 bg-positive-wash px-3.5 py-2.5 text-label text-text">
          <span className="font-medium text-positive">Credit {formatMoney(creditMinor, currency)}</span> — kept and applied to
          future tithe in {currency}
        </p>
      ) : null}
      {overCovered.map((bucket) => (
        <p key={bucket.year} className="text-xs text-text-3">
          {overCoveredNote(bucket, currency)}
        </p>
      ))}
    </section>
  );
}

function BucketItem({ bucket, currency }: { bucket: BucketPosition; currency: Currency }) {
  const hasOpening = bucket.openingMinor > 0;
  const hasRefunds = bucket.adjustmentTitheMinor < 0;
  return (
    <li className="flex flex-col gap-2.5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.9375rem] font-medium text-text">{bucket.range.label}</h3>
        <span className="flex flex-col items-end">
          <span className="text-xs text-text-3">Outstanding</span>
          <Amount minor={bucket.outstandingMinor} currency={currency} size="lg" tone="copper" />
        </span>
      </div>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-label">
        {hasOpening || hasRefunds ? (
          <>
            {bucket.incomeTitheMinor > 0 ? (
              <Row label="Tithe on income">
                <Amount minor={bucket.incomeTitheMinor} currency={currency} size="sm" tone="muted" />
              </Row>
            ) : null}
            {hasOpening ? (
              <Row label="Opening balance">
                <Amount minor={bucket.openingMinor} currency={currency} size="sm" tone="muted" />
              </Row>
            ) : null}
            {hasRefunds ? (
              <Row label="Refund adjustments">
                <Amount minor={bucket.adjustmentTitheMinor} currency={currency} size="sm" tone="muted" />
              </Row>
            ) : null}
          </>
        ) : null}
        <Row label={hasOpening || hasRefunds ? "Owed for this period" : "Tithe accrued"}>
          <Amount minor={bucket.accruedMinor} currency={currency} size="sm" />
        </Row>
        <Row label="Given">
          <Amount minor={bucket.allocatedMinor} currency={currency} size="sm" />
        </Row>
        {bucket.creditAppliedMinor > 0 ? (
          <Row label="Credit applied">
            <Amount minor={bucket.creditAppliedMinor} currency={currency} size="sm" tone="positive" />
          </Row>
        ) : null}
      </dl>
    </li>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-2">{label}</dt>
      <dd className="text-right">{children}</dd>
    </>
  );
}
