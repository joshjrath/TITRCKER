import Link from "next/link";
import { Link2 } from "lucide-react";

import { formatLocalDate, negMinor } from "@/domain";
import { Amount, Badge, Stat, StatRow } from "@/components/ui";
import type { SetAsideCurrencyVM, SetAsideEntryVM } from "@/lib/view-models";

import { LongText } from "@/components/given/LongText";

import { DeleteSetAsideButton } from "./DeleteSetAsideButton";

/** One currency's Set aside: balance, still to give, still to set aside, and the history (newest first). */
export function SetAsideCurrencySection({ data }: { data: SetAsideCurrencyVM }) {
  const { currency } = data;
  const titleId = `set-aside-${currency}`;
  const newestFirst = [...data.history].reverse();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-6 rounded-panel-lg border border-line bg-surface p-5 md:p-7">
      <h2 id={titleId} className="eyebrow">
        {currency}
      </h2>
      <StatRow>
        <Stat label="Set aside balance" minor={data.balanceMinor} currency={currency} size="xl" />
        <Stat label="Still to give" minor={data.stillToGiveMinor} currency={currency} size="lg" sublabel="What you owe your church" />
        <Stat
          label="Still to set aside"
          minor={data.stillToSetAsideMinor}
          currency={currency}
          size="lg"
          tone={data.stillToSetAsideMinor > 0 ? "copper" : "positive"}
          sublabel={stillToSetAsideNote(data)}
        />
      </StatRow>
      <p className="max-w-prose text-label text-text-2">
        Setting money aside doesn&apos;t change what you owe — it&apos;s your own record of money you&apos;ve reserved.
      </p>

      <div className="flex flex-col gap-2">
        <h3 className="text-[0.9375rem] font-medium text-text">
          History <span className="font-normal text-text-3">· newest first</span>
        </h3>
        {newestFirst.length === 0 ? (
          <p className="text-[0.875rem] text-text-2">Nothing set aside in {currency} yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line border-t border-line">
            {newestFirst.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function stillToSetAsideNote(data: SetAsideCurrencyVM): string {
  if (data.stillToSetAsideMinor > 0) return "Still to give minus Set aside";
  return data.stillToGiveMinor > 0 ? "Everything you owe is reserved" : "Nothing to give right now";
}

function HistoryRow({ entry }: { entry: SetAsideEntryVM }) {
  const reserve = entry.kind === "reserve";
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-x-3 gap-y-1 py-3.5 md:grid-cols-[7.5rem_6.5rem_minmax(0,1fr)_auto_9rem_auto] md:items-center md:gap-x-5">
      <p className="col-start-1 row-start-1 text-label text-text-2">
        <time dateTime={entry.effectiveOn}>{formatLocalDate(entry.effectiveOn)}</time>
      </p>
      <div className="col-start-1 row-start-2 md:col-start-2 md:row-start-1">
        <Badge tone={reserve ? "accent" : "neutral"}>{reserve ? "Reserved" : "Released"}</Badge>
      </div>
      <div className="col-span-3 col-start-1 row-start-3 flex min-w-0 flex-col gap-0.5 md:col-span-1 md:col-start-3 md:row-start-1">
        {entry.note ? <LongText label="Note" text={entry.note} /> : null}
        {entry.paymentId ? (
          <p className="inline-flex items-center gap-1.5 text-label text-text-3">
            <Link2 aria-hidden="true" className="size-3.5" />
            <span>
              Linked to a church payment.{" "}
              <Link href="/given" className="text-text-2 underline decoration-line-input underline-offset-2 hover:text-text">
                Reverse the payment
              </Link>{" "}
              to undo it.
            </span>
          </p>
        ) : null}
      </div>
      <div className="col-start-2 row-start-1 text-right md:col-start-4">
        <Amount minor={reserve ? entry.amountMinor : negMinor(entry.amountMinor)} currency={entry.currency} size="md" sign="always" />
      </div>
      <p className="col-start-2 row-start-2 text-right text-xs text-text-3 md:col-start-5 md:row-start-1">
        Balance <Amount minor={entry.runningBalanceMinor} currency={entry.currency} size="xs" tone="muted" />
      </p>
      <div className="col-start-3 row-span-2 row-start-1 -my-1.5 flex size-11 justify-end md:col-start-6 md:size-9">
        {entry.paymentId ? null : <DeleteSetAsideButton entry={entry} />}
      </div>
    </li>
  );
}
