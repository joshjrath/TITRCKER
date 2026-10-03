import type { Metadata } from "next";
import { AddIncomeButton } from "@/components/app";
import { LedgerView } from "@/components/ledger";
import { PageHeader } from "@/components/shell";
import { requireOwnerPage } from "@/server/auth/session";
import { now } from "@/server/clock";
import { getLedger } from "@/server/read-models/ledger";

export const metadata: Metadata = { title: "Ledger" };

/** Income ledger: every entry with its 10% tithe, refunds, filters (client-side), filtered totals and exports. */
export default async function LedgerPage() {
  const owner = await requireOwnerPage();
  const vm = await getLedger({ ownerId: owner.ownerId, now: now() });
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader
        title="Ledger"
        description="Every amount you received and its 10% tithe."
        actionSlot={<AddIncomeButton className="max-md:hidden" />}
      />
      <LedgerView vm={vm} />
    </div>
  );
}
