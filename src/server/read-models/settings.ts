import "server-only";

import { eq } from "drizzle-orm";

import type { OpeningVM, SettingsPageVM } from "@/lib/view-models";
import { user } from "@/server/db/schema";
import { withOwnerSnapshot, type OwnerTx } from "@/server/db/with-owner";
import type { ServiceContext } from "@/server/services/context";
import { earliestActiveIncomeDate } from "@/server/services/income";
import { loadOwnerLedgerTx } from "@/server/services/snapshot";

/** IANA zones offered in Settings: the runtime's list, always including the configured zone. */
export function supportedTimeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  const set = new Set(zones);
  set.add(current);
  set.add("UTC");
  return [...set].sort();
}

/** The auth user row of the session owner (email + 2FA flag). */
export async function loadAccount(tx: OwnerTx, ownerId: string): Promise<{ email: string; twoFactorEnabled: boolean }> {
  const [row] = await tx
    .select({ email: user.email, twoFactorEnabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, ownerId));
  return { email: row?.email ?? "", twoFactorEnabled: row?.twoFactorEnabled === true };
}

/** The Settings page: settings, active opening balances, account security state and the time zone list. */
export async function getSettingsPage(ctx: ServiceContext): Promise<SettingsPageVM> {
  return withOwnerSnapshot(ctx.ownerId, async (tx) => {
    const ledger = await loadOwnerLedgerTx(tx, ctx);
    const account = await loadAccount(tx, ctx.ownerId);
    const openings: OpeningVM[] = ledger.snapshot.openings.map((o) => ({
      id: o.id,
      currency: o.currency,
      amountMinor: o.amountMinor,
      effectiveOn: o.effectiveOn,
      label: o.label,
      note: o.note,
      version: o.version,
      createdAt: o.createdAt,
    }));
    return {
      today: ledger.today,
      settings: ledger.settings,
      openings,
      email: account.email,
      twoFactorEnabled: account.twoFactorEnabled,
      earliestIncomeDate: await earliestActiveIncomeDate(tx, ctx.ownerId),
      timeZones: supportedTimeZones(ledger.settings.timeZone),
    };
  });
}
