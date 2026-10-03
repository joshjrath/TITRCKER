import "server-only";

import {
  ROUNDING_POLICY,
  TITHE_RATE_BPS,
  toLocalDate,
  todayInZone,
  type LocalDate,
  type TrackingSettings,
} from "@/domain";
import type { SettingsVM } from "@/lib/view-models";
import { readSettingsRow, withOwner, type AppSettingsRow, type OwnerTx } from "@/server/db/with-owner";

import type { ServiceContext } from "./context";
import { toCurrency } from "./records";

export function settingsVMFromRow(row: AppSettingsRow): SettingsVM {
  return {
    trackingStart: toLocalDate(row.trackingStart),
    timeZone: row.timeZone,
    displayCurrency: toCurrency(row.displayCurrency),
    lastEntryCurrency: toCurrency(row.lastEntryCurrency),
    churchName: row.churchName ?? "",
    nextPayoutDate: toLocalDate(row.nextPayoutDate),
    nextPayoutIsDefault: row.nextPayoutIsDefault,
    titheRateBps: TITHE_RATE_BPS,
    roundingPolicy: ROUNDING_POLICY,
    version: row.version,
  };
}

export function trackingSettingsFromRow(row: AppSettingsRow): TrackingSettings {
  return {
    trackingStart: toLocalDate(row.trackingStart),
    timeZone: row.timeZone,
    displayCurrency: toCurrency(row.displayCurrency),
    nextPayoutDate: toLocalDate(row.nextPayoutDate),
    nextPayoutIsDefault: row.nextPayoutIsDefault,
  };
}

/** "Today" for this owner: the local date of `now` in the configured time zone (ARCHITECTURE §4). */
export function todayForSettings(row: Pick<AppSettingsRow, "timeZone">, now: Date): LocalDate {
  return todayInZone(now, row.timeZone);
}

/** Ensures the owner's settings row exists (defaults from domain constants) and returns it as a view model. */
export async function ensureSettings(tx: OwnerTx, ownerId: string): Promise<SettingsVM> {
  return settingsVMFromRow(await readSettingsRow(tx, ownerId));
}

/** The owner's settings (created with defaults on first use). */
export async function getSettings(ctx: ServiceContext): Promise<SettingsVM> {
  return withOwner(ctx.ownerId, (tx) => ensureSettings(tx, ctx.ownerId));
}
