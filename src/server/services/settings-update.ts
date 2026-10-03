import "server-only";

import { eq, sql } from "drizzle-orm";

import { formatLocalDate } from "@/domain";
import { settingsUpdateSchema, type SettingsUpdateInput } from "@/lib/validation";
import type { SettingsVM } from "@/lib/view-models";
import { appSettings } from "@/server/db/schema";

import { appendAudit } from "./audit";
import type { ServiceContext } from "./context";
import { staleError, validationError } from "./errors";
import { earliestActiveIncomeDate } from "./income";
import { idempotentMutation } from "./mutation";
import { settingsVMFromRow, todayForSettings } from "./settings";

// Lives apart from settings.ts because mutation.ts imports settings.ts (no circular imports).

export const SETTINGS_OPERATIONS = { update: "settings.update" } as const;

/**
 * Updates the owner's settings (optimistic concurrency via `expectedVersion`; an identical submission is a no-op).
 * Rules, with "today" taken in the NEW time zone:
 * - time zone: a valid IANA zone (schema);
 * - tracking start <= today and <= the earliest active income date (income can't predate the tracking start);
 * - next payout date, when changed: >= today and >= the tracking start; setting it clears next_payout_is_default.
 */
export async function updateSettings(ctx: ServiceContext, raw: SettingsUpdateInput): Promise<SettingsVM> {
  return idempotentMutation(ctx, SETTINGS_OPERATIONS.update, settingsUpdateSchema, raw, async (m) => {
    const { data, settings: row } = m;
    const churchName = data.churchName;
    const payoutChanged = row.nextPayoutDate !== data.nextPayoutDate;
    const unchanged =
      row.trackingStart === data.trackingStart &&
      row.timeZone === data.timeZone &&
      row.displayCurrency === data.displayCurrency &&
      row.churchName === churchName &&
      !payoutChanged;
    if (unchanged) return settingsVMFromRow(row);
    if (row.version !== data.expectedVersion) throw staleError();

    const today = todayForSettings({ timeZone: data.timeZone }, ctx.now);
    const errors: Record<string, string> = {};
    if (data.trackingStart > today) {
      errors.trackingStart = `The tracking start can't be in the future. Today is ${formatLocalDate(today)}.`;
    } else {
      const earliest = await earliestActiveIncomeDate(m.tx, m.ownerId);
      if (earliest !== null && data.trackingStart > earliest) {
        errors.trackingStart = `Your earliest income is dated ${formatLocalDate(earliest)}, so tracking must start on or before that date.`;
      }
    }
    if (payoutChanged) {
      if (data.nextPayoutDate < today) {
        errors.nextPayoutDate = `The next payout date can't be in the past. Today is ${formatLocalDate(today)}.`;
      } else if (data.nextPayoutDate < data.trackingStart) {
        errors.nextPayoutDate = "The next payout date can't be before the tracking start.";
      }
    }
    if (Object.keys(errors).length > 0) throw validationError(errors);

    const [updated] = await m.tx
      .update(appSettings)
      .set({
        trackingStart: data.trackingStart,
        timeZone: data.timeZone,
        displayCurrency: data.displayCurrency,
        churchName,
        nextPayoutDate: data.nextPayoutDate,
        nextPayoutIsDefault: payoutChanged ? false : row.nextPayoutIsDefault,
        updatedAt: sql`now()`,
        version: sql`${appSettings.version} + 1`,
      })
      .where(eq(appSettings.ownerId, m.ownerId))
      .returning();
    if (!updated) throw staleError();

    await appendAudit(m.tx, m.ownerId, {
      entityType: "settings",
      entityId: m.ownerId,
      action: "update",
      before: settingsVMFromRow(row),
      after: settingsVMFromRow(updated),
    });
    return settingsVMFromRow(updated);
  });
}
