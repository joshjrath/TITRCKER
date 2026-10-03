import type { Metadata } from "next";
import { AddIncomeButton } from "@/components/app";
import { BalanceSurface, CurrencySwitch, OverviewCharts, PeriodLabel, PeriodSelect, RecentEntries } from "@/components/overview";
import { ScriptureBand } from "@/components/scripture";
import { PageHeader } from "@/components/shell";
import { requireOwnerPage } from "@/server/auth/session";
import { now } from "@/server/clock";
import { getOverview } from "@/server/read-models/overview";

export const metadata: Metadata = { title: "Overview" };

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/** Overview: what is still to give, the selected period's figures, next payout, quick entry, charts, recent rows. */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const owner = await requireOwnerPage();
  const sp = await searchParams;
  const vm = await getOverview(
    { ownerId: owner.ownerId, now: now() },
    { period: single(sp.period), currency: single(sp.currency) },
  );
  const periodKey = String(vm.period.key);
  const bothActive = vm.headlines.every((h) => h.hasActivity);

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <ScriptureBand />

      <PageHeader
        title="Overview"
        periodSlot={
          vm.isEmpty ? (
            <PeriodLabel label={vm.period.label} />
          ) : (
            <PeriodSelect options={vm.periodOptions} value={periodKey} currency={vm.currency} trackingStart={vm.settings.trackingStart} />
          )
        }
        currencySlot={vm.isEmpty ? undefined : <CurrencySwitch value={vm.currency} period={periodKey} switchable={bothActive} />}
        actionSlot={<AddIncomeButton className="max-md:hidden" />}
      />

      <BalanceSurface vm={vm} />

      {vm.isEmpty ? null : (
        <div className="flex flex-col gap-6 md:gap-8">
          <RecentEntries rows={vm.recent} className="order-1 md:order-2" />
          <OverviewCharts
            chart={vm.chart}
            monthly={vm.monthly}
            today={vm.today}
            payoutDate={vm.payout.targetDate}
            className="order-2 md:order-1"
          />
        </div>
      )}
    </div>
  );
}
