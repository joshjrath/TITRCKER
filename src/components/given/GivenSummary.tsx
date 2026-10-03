import Link from "next/link";

import { formatLocalDate, formatMoney, type Currency, type PayoutStatus } from "@/domain";
import { AnimatedAmount } from "@/components/motion";
import { PrivacyToggle } from "@/components/privacy";
import { Amount, Badge, Stat, StatRow, type BadgeTone } from "@/components/ui";
import { CombinedTotalLine } from "@/components/fx";
import type { CombinedTotalVM, CurrencyHeadlineVM } from "@/lib/view-models";

import { ReviewPayoutButton } from "./PaymentLauncher";

export interface GivenSummaryProps {
  currency: Currency;
  headline: CurrencyHeadlineVM;
  payout: PayoutStatus;
  /** The other currency's headline when it has activity (shown compactly, never added). */
  other: CurrencyHeadlineVM | null;
  /** Display-only combined total in CAD (ARCHITECTURE §3.10). */
  combined?: CombinedTotalVM;
}

const phaseTone: Record<PayoutStatus["phase"], BadgeTone> = {
  upcoming: "neutral",
  settled_rolled: "neutral",
  due_today: "copper",
  overdue: "danger",
};

/** Still to give for the selected currency, its accrued / given figures, and the payout status block. */
export function GivenSummary({ currency, headline, payout, other, combined }: GivenSummaryProps) {
  const status = payout.perCurrency.find((p) => p.currency === currency);
  const due = status?.dueMinor ?? headline.stillToGiveMinor;
  const overdue = status?.overdueMinor ?? 0;
  const otherDue = other ? payout.perCurrency.find((p) => p.currency === other.currency)?.dueMinor ?? 0 : 0;

  return (
    <section
      aria-labelledby="given-balance-title"
      className="noise hero-glow relative overflow-hidden rounded-panel-lg border border-line bg-surface p-5 md:p-8"
    >
      <div className="flex items-center gap-2">
        <h2 id="given-balance-title" className="text-label text-text-2">
          Still to give · {currency}
        </h2>
        <PrivacyToggle className="-my-2.5 md-fine:-my-1.5" />
      </div>
      <p className="@container mt-3">
        <AnimatedAmount minor={headline.stillToGiveMinor} currency={currency} size="hero" />
      </p>
      {combined ? <CombinedTotalLine combined={combined} className="mt-2" /> : null}
      {headline.creditMinor > 0 ? (
        <p className="mt-2 text-label text-positive">
          Credit {formatMoney(headline.creditMinor, currency)} — kept and applied to future tithe in {currency}
        </p>
      ) : null}

      <StatRow className="mt-6">
        <Stat label="Tithe accrued" minor={headline.accruedMinor} currency={currency} size="md" sublabel="All time, including opening balances" />
        <Stat label="Given" minor={headline.paidMinor} currency={currency} size="md" sublabel="Payments recorded, all time" />
        <Stat label="Set aside" minor={headline.setAsideMinor} currency={currency} size="md" sublabel="Your own reserve record" />
      </StatRow>

      <div className="mt-7 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="eyebrow">Next payout</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-xl font-normal tracking-[-0.01em] text-copper">{formatLocalDate(payout.targetDate)}</p>
            <Badge tone={phaseTone[payout.phase]}>{payout.label}</Badge>
          </div>
          <DueLine currency={currency} dueMinor={due} overdueMinor={overdue} targetDate={payout.targetDate} />
          {payout.isDefaultDate ? (
            <p className="text-xs text-text-3">
              Default date.{" "}
              <Link href="/settings" className="text-text-2 underline decoration-line-input underline-offset-2 hover:text-text">
                Change it in Settings
              </Link>
            </p>
          ) : null}
          {other && otherDue > 0 ? (
            <p className="text-label text-text-2">
              Also due in {other.currency}: <Amount minor={otherDue} currency={other.currency} size="sm" />{" "}
              <Link
                href={`/given?currency=${other.currency}`}
                className="text-accent underline-offset-2 hover:underline"
              >
                View {other.currency}
              </Link>
            </p>
          ) : null}
        </div>
        {due > 0 ? <ReviewPayoutButton className="sm:shrink-0" /> : null}
      </div>
    </section>
  );
}

function DueLine({
  currency,
  dueMinor,
  overdueMinor,
  targetDate,
}: {
  currency: Currency;
  dueMinor: number;
  overdueMinor: number;
  targetDate: PayoutStatus["targetDate"];
}) {
  if (dueMinor <= 0) {
    return <p className="text-[0.9375rem] text-positive">Nothing due in {currency}. You&apos;re all caught up.</p>;
  }
  if (overdueMinor > 0) {
    return (
      <p className="text-[0.9375rem] text-text-2">
        <span className="font-medium text-danger">Overdue</span>{" "}
        <Amount minor={overdueMinor} currency={currency} size="md" tone="danger" /> of{" "}
        <Amount minor={dueMinor} currency={currency} size="md" /> still to give
      </p>
    );
  }
  return (
    <p className="text-[0.9375rem] text-text-2">
      Amount due by {formatLocalDate(targetDate, "short")}: <Amount minor={dueMinor} currency={currency} size="md" />
    </p>
  );
}
