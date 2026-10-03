import { formatLocalDate, formatMoney, type Currency } from "@/domain";
import { Amount, Badge, EmptyState, cn, keepMoneyTogether } from "@/components/ui";
import type { PaymentVM } from "@/lib/view-models";

import { LongText } from "./LongText";
import { PaymentHistoryItemFrame } from "./PaymentHistoryItemFrame";
import { RecordPaymentButton } from "./PaymentLauncher";
import { PaymentRowActions } from "./PaymentRowActions";

export interface PaymentHistoryProps {
  currency: Currency;
  /** Payments of the selected currency, newest first (including reversed ones). */
  payments: readonly PaymentVM[];
  /** Number of payments recorded in the other currency (mentioned, not mixed in). */
  otherCurrencyCount: number;
  otherCurrency: Currency;
}

/** Payment history, newest first. Reversed payments stay visible, struck through and labelled "Reversed". */
export function PaymentHistory({ currency, payments, otherCurrencyCount, otherCurrency }: PaymentHistoryProps) {
  return (
    <section aria-labelledby="payments-title" className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="payments-title" className="text-lg font-medium text-text">
          Payment history
        </h2>
        <p className="text-label text-text-3">
          {currency} · newest first
          {otherCurrencyCount > 0
            ? ` · ${otherCurrencyCount} ${otherCurrency} ${otherCurrencyCount === 1 ? "payment" : "payments"} under ${otherCurrency}`
            : ""}
        </p>
      </header>
      {payments.length === 0 ? (
        <div className="rounded-panel-lg border border-line bg-surface px-5 md:px-6">
          <EmptyState
            headingLevel={3}
            title={`No ${currency} payments recorded yet`}
            description="When you give to your church, record it here so what you still have to give stays accurate."
            action={<RecordPaymentButton />}
          />
        </div>
      ) : (
        <ol className="flex flex-col divide-y divide-line rounded-panel-lg border border-line bg-surface px-4 md:px-6">
          {payments.map((payment) => (
            <PaymentItem key={payment.id} payment={payment} />
          ))}
        </ol>
      )}
    </section>
  );
}

function PaymentItem({ payment }: { payment: PaymentVM }) {
  const reversed = payment.reversedAt !== null;
  return (
    <PaymentHistoryItemFrame
      paymentId={payment.id}
      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-x-3 gap-y-1.5 py-4 md:grid-cols-[7.5rem_minmax(0,1fr)_auto_auto] md:gap-x-5"
    >
      <p className={cn("col-start-1 row-start-1 pt-1 text-label", reversed ? "text-text-3" : "text-text-2")}>
        <time dateTime={payment.paidOn}>{formatLocalDate(payment.paidOn)}</time>
      </p>
      <div className="col-span-3 col-start-1 row-start-2 flex min-w-0 flex-col gap-1 md:col-span-1 md:col-start-2 md:row-start-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-[0.9375rem] font-medium [overflow-wrap:anywhere]", reversed ? "text-text-2" : "text-text")}>
            {payment.churchName}
          </p>
          {reversed ? <Badge tone="danger">Reversed</Badge> : null}
        </div>
        <AllocationSummary payment={payment} />
        {payment.reference ? <LongText label="Reference" text={payment.reference} /> : null}
        {payment.note ? <LongText label="Note" text={payment.note} /> : null}
        {reversed ? (
          <LongText label="Reversed" text={payment.reversalReason ?? "No reason recorded"} />
        ) : null}
        {payment.linkedSetAsideMinor > 0 ? (
          <p className="text-label text-text-3" data-sensitive>
            {keepMoneyTogether(
              reversed
                ? `The ${formatMoney(payment.linkedSetAsideMinor, payment.currency)} taken out of Set aside was put back.`
                : `Taken out of Set aside: ${formatMoney(payment.linkedSetAsideMinor, payment.currency)}`,
            )}
          </p>
        ) : null}
      </div>
      <div className="col-start-2 row-start-1 flex justify-end md:col-start-3">
        <Amount
          minor={payment.amountMinor}
          currency={payment.currency}
          size="lg"
          tone={reversed ? "muted" : "default"}
          className={reversed ? "line-through decoration-text-3" : undefined}
        />
      </div>
      <div className="col-start-3 row-start-1 -my-2 flex size-11 justify-end md:col-start-4 md:-my-1.5 md:size-9">
        {reversed ? null : <PaymentRowActions payment={payment} />}
      </div>
    </PaymentHistoryItemFrame>
  );
}

function AllocationSummary({ payment }: { payment: PaymentVM }) {
  const parts = payment.allocations
    .slice()
    .sort((a, b) => a.bucketYear - b.bucketYear)
    .map((a) => `${a.bucketYear}: ${formatMoney(a.amountMinor, payment.currency)}`);
  if (payment.unallocatedMinor > 0) parts.push(`Credit: ${formatMoney(payment.unallocatedMinor, payment.currency)}`);
  if (parts.length === 0) return null;
  return (
    <p className="tabular text-label text-text-2" data-sensitive>
      <span className="text-text-3">Covers </span>
      {keepMoneyTogether(parts.join(" · "))}
    </p>
  );
}
