import type { Metadata } from "next";

import { CurrencySwitch } from "@/components/given/CurrencySwitch";
import { GivenSummary } from "@/components/given/GivenSummary";
import { OutstandingObligations } from "@/components/given/OutstandingObligations";
import { paymentContextFromGiven } from "@/components/given/payment-context";
import { PaymentHistory } from "@/components/given/PaymentHistory";
import { PaymentLauncher, RecordPaymentButton } from "@/components/given/PaymentLauncher";
import { PageHeader } from "@/components/shell";
import { InlineAlert } from "@/components/ui";
import { requireOwnerPage } from "@/server/auth/session";
import { now } from "@/server/clock";
import { getGiven } from "@/server/read-models/given";

export const metadata: Metadata = { title: "Given" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default async function GivenPage({ searchParams }: { searchParams: SearchParams }) {
  const owner = await requireOwnerPage();
  const params = await searchParams;
  const vm = await getGiven({ ownerId: owner.ownerId, now: now() }, { currency: single(params.currency) });

  const { currency } = vm;
  const headline = vm.headlines.find((h) => h.currency === currency);
  if (!headline) throw new Error(`Missing headline for ${currency}`);
  const active = vm.headlines.filter((h) => h.hasActivity);
  const other = vm.headlines.find((h) => h.currency !== currency && h.hasActivity) ?? null;
  const otherCurrency = vm.headlines.find((h) => h.currency !== currency)?.currency ?? currency;
  const payments = vm.payments.filter((p) => p.currency === currency);

  return (
    <PaymentLauncher context={paymentContextFromGiven(vm)} openPayoutOnLoad={single(params.review) === "payout"}>
      <div className="flex flex-col gap-6 md:gap-8">
        <div className="flex flex-col gap-4">
          <PageHeader
            title="Given"
            currencySlot={active.length > 1 ? <CurrencySwitch value={currency} basePath="/given" /> : undefined}
            actionSlot={<RecordPaymentButton />}
          />
          <InlineAlert tone="info" className="max-w-3xl">
            Tenth records payments you made to your church elsewhere. It never moves money or contacts your bank.
          </InlineAlert>
        </div>

        <div className="grid items-start gap-6 desk:grid-cols-12 desk:gap-8">
          <div className="desk:col-span-7">
            <GivenSummary currency={currency} headline={headline} payout={vm.payout} other={other} />
          </div>
          <div className="desk:col-span-5">
            <OutstandingObligations
              currency={currency}
              buckets={vm.bucketsByCurrency[currency]}
              stillToGiveMinor={headline.stillToGiveMinor}
              creditMinor={headline.creditMinor}
            />
          </div>
        </div>

        <PaymentHistory
          currency={currency}
          payments={payments}
          otherCurrency={otherCurrency}
          otherCurrencyCount={vm.payments.filter((p) => p.currency !== currency).length}
        />
      </div>
    </PaymentLauncher>
  );
}
