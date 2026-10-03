import type { Metadata } from "next";

import { CURRENCIES, ZERO, type Currency, type Minor } from "@/domain";
import { AddSetAsideButton } from "@/components/set-aside/AddSetAsideButton";
import { SetAsideCurrencySection } from "@/components/set-aside/SetAsideCurrencySection";
import { PageHeader } from "@/components/shell";
import { requireOwnerPage } from "@/server/auth/session";
import { now } from "@/server/clock";
import { getSetAside } from "@/server/read-models/set-aside";

export const metadata: Metadata = { title: "Set aside" };

export default async function SetAsidePage() {
  const owner = await requireOwnerPage();
  const vm = await getSetAside({ ownerId: owner.ownerId, now: now() });

  const withActivity = vm.perCurrency.filter((c) => c.history.length > 0 || c.stillToGiveMinor > 0 || c.balanceMinor > 0);
  const display = vm.settings.displayCurrency;
  const sections =
    withActivity.length > 0 ? withActivity : vm.perCurrency.filter((c) => c.currency === display);
  const balances = Object.fromEntries(
    CURRENCIES.map((c) => [c, vm.perCurrency.find((p) => p.currency === c)?.balanceMinor ?? ZERO]),
  ) as Record<Currency, Minor>;
  const defaultCurrency = sections[0]?.currency ?? display;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader
        title="Set aside"
        description="Optional. Keep a record of money you've put aside for your tithe until you give it."
        actionSlot={<AddSetAsideButton today={vm.today} defaultCurrency={defaultCurrency} balances={balances} />}
      />
      {sections.map((data) => (
        <SetAsideCurrencySection key={data.currency} data={data} />
      ))}
    </div>
  );
}
