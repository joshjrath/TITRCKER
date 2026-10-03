import type { Metadata } from "next";

import { PageHeader } from "@/components/shell";
import {
  AccountSection,
  ChangePasswordForm,
  DataExport,
  OpeningBalances,
  SettingsNav,
  SettingsSection,
  TitheRateInfo,
  TrackingForm,
  TwoFactorPanel,
} from "@/components/settings";
import { requireOwnerPage } from "@/server/auth/session";
import { now } from "@/server/clock";
import { getSettingsPage } from "@/server/read-models/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const owner = await requireOwnerPage();
  const vm = await getSettingsPage({ ownerId: owner.ownerId, now: now() });
  const { settings } = vm;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader title="Settings" description="How Tenth keeps your record, and your account." />
      <div className="grid gap-5 desk:grid-cols-[11rem_minmax(0,1fr)] desk:gap-10">
        <SettingsNav />
        <div className="min-w-0 rounded-panel-lg border border-line bg-surface">
          <SettingsSection
            id="tracking"
            title="Tracking"
            description="Which income counts, when you plan to give, and how dates and currencies are shown."
          >
            <TrackingForm
              key={settings.version}
              settings={settings}
              today={vm.today}
              earliestIncomeDate={vm.earliestIncomeDate}
              timeZones={vm.timeZones}
            />
          </SettingsSection>

          <SettingsSection id="tithe-rate" title="Tithe rate" description="Fixed for every entry. It can't be changed.">
            <TitheRateInfo titheRateBps={settings.titheRateBps} currency={settings.displayCurrency} />
          </SettingsSection>

          <SettingsSection
            id="opening-balances"
            title="Opening balances"
            description="An existing tithe you already owed before you started recording income. It's added to what you owe but never counted as income."
          >
            <OpeningBalances openings={vm.openings} today={vm.today} defaultCurrency={settings.displayCurrency} />
          </SettingsSection>

          <SettingsSection id="security" title="Security" description="Your password and an optional second step when you sign in.">
            <div className="flex flex-col gap-8">
              <ChangePasswordForm email={vm.email} />
              <div className="border-t border-line pt-8">
                <TwoFactorPanel enabled={vm.twoFactorEnabled} account={vm.email} today={vm.today} />
              </div>
            </div>
          </SettingsSection>

          <SettingsSection id="data" title="Data" description="Take a copy of your record whenever you like.">
            <DataExport />
          </SettingsSection>

          <SettingsSection id="account" title="Account">
            <AccountSection email={vm.email} />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
