import "server-only";

import { eq, sql } from "drizzle-orm";

import {
  DEFAULT_CURRENCY,
  DEFAULT_PAYOUT_DATE,
  DEFAULT_TIME_ZONE,
  DEFAULT_TRACKING_START,
} from "@/domain";

import { getDb, type Database } from "./client";
import { appSettings } from "./schema";

/** The transaction handle passed to withOwner callbacks. */
export type OwnerTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** A row of app_settings as Drizzle returns it. */
export type AppSettingsRow = typeof appSettings.$inferSelect;

function assertOwnerId(ownerId: string): void {
  if (typeof ownerId !== "string" || ownerId.length === 0) {
    throw new Error("withOwner: an owner id from the server session is required");
  }
}

/**
 * Runs `fn` in a transaction scoped to one owner: `set_config('app.owner_id', ownerId, true)` makes the
 * row-level-security policies admit only that owner's rows, for this transaction only. Queries inside must
 * still filter by owner_id explicitly (the application check); RLS is the backstop.
 */
export async function withOwner<T>(ownerId: string, fn: (tx: OwnerTx) => Promise<T>): Promise<T> {
  assertOwnerId(ownerId);
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.owner_id', ${ownerId}, true)`);
    return fn(tx);
  });
}

/** Default settings for a new owner, from the domain constants. */
function defaultSettings(ownerId: string): typeof appSettings.$inferInsert {
  return {
    ownerId,
    trackingStart: DEFAULT_TRACKING_START,
    timeZone: DEFAULT_TIME_ZONE,
    displayCurrency: DEFAULT_CURRENCY,
    lastEntryCurrency: DEFAULT_CURRENCY,
    churchName: null,
    nextPayoutDate: DEFAULT_PAYOUT_DATE,
    nextPayoutIsDefault: true,
  };
}

/** Inserts the owner's settings row with defaults when missing (no-op when it exists). */
export async function ensureSettingsRow(tx: OwnerTx, ownerId: string): Promise<void> {
  await tx.insert(appSettings).values(defaultSettings(ownerId)).onConflictDoNothing({ target: appSettings.ownerId });
}

/** Reads the owner's settings row, creating it with defaults first if needed. */
export async function readSettingsRow(tx: OwnerTx, ownerId: string): Promise<AppSettingsRow> {
  const [existing] = await tx.select().from(appSettings).where(eq(appSettings.ownerId, ownerId));
  if (existing) return existing;
  await ensureSettingsRow(tx, ownerId);
  const [created] = await tx.select().from(appSettings).where(eq(appSettings.ownerId, ownerId));
  if (!created) throw new Error("withOwner: settings row could not be created");
  return created;
}

/**
 * Like {@link withOwner}, but first ensures the owner's app_settings row exists and locks it
 * `FOR UPDATE`. Every balance-affecting mutation uses this, which serializes the owner's financial writes
 * (refund limits, allocation limits and set-aside balances become race-free, and concurrent requests with
 * the same idempotency key queue behind each other). The locked settings row is passed to `fn`.
 */
export async function withOwnerLocked<T>(
  ownerId: string,
  fn: (tx: OwnerTx, settings: AppSettingsRow) => Promise<T>,
): Promise<T> {
  return withOwner(ownerId, async (tx) => {
    await ensureSettingsRow(tx, ownerId);
    const [settings] = await tx
      .select()
      .from(appSettings)
      .where(eq(appSettings.ownerId, ownerId))
      .for("update");
    if (!settings) throw new Error("withOwnerLocked: settings row missing after ensure");
    return fn(tx, settings);
  });
}
