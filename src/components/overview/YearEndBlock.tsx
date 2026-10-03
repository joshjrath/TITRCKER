import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { formatLocalDate, type Currency, type PayoutStatus } from "@/domain";
import { PeriodTimeline } from "@/components/charts";
import { Amount, buttonClasses, cn } from "@/components/ui";
import type { PeriodProgressVM } from "@/lib/view-models";
import { payoutReviewHref } from "./overview-text";

export interface YearEndBlockProps {
  payout: PayoutStatus;
  currency: Currency;
  progress: PeriodProgressVM;
}

/** Next payout: date (copper), countdown/overdue status in text, amount to give, review action, timeline. */
export function YearEndBlock({ payout, currency, progress }: YearEndBlockProps) {
  const selected = payout.perCurrency.find((p) => p.currency === currency);
  const others = payout.perCurrency.filter((p) => p.currency !== currency && p.dueMinor > 0);
  const overdue = payout.perCurrency.filter((p) => p.overdueMinor > 0);
  const isOverdue = payout.phase === "overdue";
  const dueMinor = selected?.dueMinor ?? 0;

  return (
    <section aria-labelledby="payout-heading" className="flex flex-col">
      <h2 id="payout-heading" className="text-[0.9375rem] font-medium text-text-2">
        Next payout
      </h2>
      <p className="mt-2 text-[1.75rem] font-light leading-tight tracking-[-0.02em] text-copper md:text-[2rem]">
        <time dateTime={payout.targetDate}>{formatLocalDate(payout.targetDate)}</time>
      </p>
      <p className={cn("mt-1 flex items-center gap-1.5 text-[0.9375rem]", isOverdue ? "font-medium text-danger" : "text-text")}>
        {isOverdue ? <CircleAlert aria-hidden="true" className="size-4 shrink-0" /> : null}
        {payout.label}
      </p>
      {payout.isDefaultDate ? (
        <p className="mt-1 text-xs text-text-3">
          Default date —{" "}
          <Link href="/settings" className="text-text-2 underline underline-offset-4 hover:text-text">
            set a date in Settings
          </Link>
        </p>
      ) : null}

      {overdue.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {overdue.map((o) => (
            <li key={o.currency} className="flex items-baseline gap-2 text-label text-danger">
              Overdue <Amount minor={o.overdueMinor} currency={o.currency} size="sm" tone="danger" />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex flex-col items-start gap-1">
        <p className="text-label text-text-2">To give at payout</p>
        {dueMinor > 0 ? (
          <Amount minor={dueMinor} currency={currency} size="lg" />
        ) : (
          <p className="text-[0.9375rem] text-text">Nothing to give right now</p>
        )}
        {others.map((o) => (
          <p key={o.currency} className="text-label text-text-2">
            and <Amount minor={o.dueMinor} currency={o.currency} size="sm" />
          </p>
        ))}
        {dueMinor > 0 ? (
          <Link href={payoutReviewHref(currency)} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}>
            Review payout
          </Link>
        ) : null}
      </div>

      <PeriodTimeline
        className="mt-6"
        start={progress.start}
        end={progress.end}
        today={progress.today}
        payoutDate={payout.targetDate}
        todayLabel="Today"
      />
    </section>
  );
}
