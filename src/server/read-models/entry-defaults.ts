import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import type { EntryDefaultsVM } from "@/lib/view-models";
import { incomeEntry } from "@/server/db/schema";
import { readSettingsRow, withOwnerSnapshot } from "@/server/db/with-owner";
import type { ServiceContext } from "@/server/services/context";
import { settingsVMFromRow, todayForSettings } from "@/server/services/settings";

import { distinctCategories } from "./common";

/**
 * The small set of values the income entry form needs on every app page (loaded by the (app) layout):
 * today in the owner's time zone, the last used currency, the tracking start and previous categories.
 * Two cheap queries (settings row + distinct categories) instead of the full ledger snapshot.
 */
export async function getEntryDefaults(ctx: ServiceContext): Promise<EntryDefaultsVM> {
  return withOwnerSnapshot(ctx.ownerId, async (tx) => {
    const row = await readSettingsRow(tx, ctx.ownerId);
    const settings = settingsVMFromRow(row);
    const categoryRows = await tx
      .selectDistinct({ category: incomeEntry.category })
      .from(incomeEntry)
      .where(and(eq(incomeEntry.ownerId, ctx.ownerId), isNull(incomeEntry.deletedAt), isNotNull(incomeEntry.category)));
    return {
      today: todayForSettings(row, ctx.now),
      currency: settings.lastEntryCurrency,
      trackingStart: settings.trackingStart,
      categories: distinctCategories(categoryRows.map((r) => r.category)),
    };
  });
}
