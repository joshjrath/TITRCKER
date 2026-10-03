import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb } from "@/server/db/client";
import { auditEvent, openingObligation } from "@/server/db/schema";
import { withOwner } from "@/server/db/with-owner";
import { getSettingsPage } from "@/server/read-models/settings";
import { createIncome } from "@/server/services/income";
import { createOpening, deleteOpening, updateOpening } from "@/server/services/opening";
import { getSettings } from "@/server/services/settings";
import { updateSettings } from "@/server/services/settings-update";

import { createTestUser, resetAppData } from "./helpers/db";
import { addIncome, balancesFor } from "./helpers/ledger";
import { ctxFor, expectServiceError, key, noonToronto } from "./helpers/services";

afterAll(closeDb);

let owner: string;
beforeEach(async () => {
  await resetAppData();
  owner = await createTestUser("settings-owner@example.test");
});

const baseSettings = {
  expectedVersion: 1,
  trackingStart: "2026-10-03",
  timeZone: "America/Toronto",
  displayCurrency: "CAD" as "CAD" | "USD",
  churchName: null as string | null,
  nextPayoutDate: "2026-12-31",
};

const save = (patch: Partial<typeof baseSettings>, now = noonToronto("2026-10-10")) =>
  updateSettings(ctxFor(owner, now), { idempotencyKey: key(), ...baseSettings, ...patch });

describe("settings updates", () => {
  it("saves valid changes, bumps the version and audits", async () => {
    const vm = await save({ displayCurrency: "USD", churchName: "  Grace Church ", timeZone: "America/Vancouver" });
    expect(vm).toMatchObject({ displayCurrency: "USD", churchName: "Grace Church", timeZone: "America/Vancouver", version: 2, nextPayoutIsDefault: true });
    const audits = await withOwner(owner, (tx) => tx.select().from(auditEvent).where(eq(auditEvent.ownerId, owner)));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ entityType: "settings", action: "update" });
  });

  it("an identical submission is a no-op; a different one with an old version is stale", async () => {
    expect(await save({})).toMatchObject({ version: 1 });
    await save({ displayCurrency: "USD" });
    expect(await save({ displayCurrency: "USD" })).toMatchObject({ version: 2 });
    await expectServiceError(save({ churchName: "Other" }), "stale");
  });

  it("validates the time zone", async () => {
    await expectServiceError(save({ timeZone: "Mars/Olympus" }), "validation", "timeZone");
    await expectServiceError(save({ timeZone: "" }), "validation", "timeZone");
    await expectServiceError(save({ timeZone: "+05:00" }), "validation", "timeZone");
  });

  it("stores the canonical IANA name for the time zone", async () => {
    const lower = await save({ timeZone: "america/toronto" });
    expect(lower.timeZone).toBe("America/Toronto");
    const alias = await save({ timeZone: "US/Eastern", expectedVersion: lower.version });
    expect(alias.timeZone).toBe("America/New_York");
  });

  it("tracking start must be <= today and <= the earliest active income", async () => {
    await expectServiceError(save({ trackingStart: "2026-10-11" }), "validation", "trackingStart");
    await addIncome(owner, "10.00", "2026-10-05", { today: "2026-10-10" });
    await expectServiceError(save({ trackingStart: "2026-10-06" }), "validation", "trackingStart");
    const vm = await save({ trackingStart: "2026-01-01" });
    expect(vm.trackingStart).toBe("2026-01-01");
    // Income can now be backdated to the new start.
    await expect(
      createIncome(ctxFor(owner), { idempotencyKey: key(), amount: "5.00", currency: "CAD", receivedOn: "2026-02-01" }),
    ).resolves.toMatchObject({ receivedOn: "2026-02-01" });
    const page = await getSettingsPage(ctxFor(owner));
    expect(page.earliestIncomeDate).toBe("2026-02-01");
  });

  it("next payout date: >= today when changed, then no longer the default", async () => {
    await expectServiceError(save({ nextPayoutDate: "2026-10-09" }), "validation", "nextPayoutDate");
    const vm = await save({ nextPayoutDate: "2026-11-30" });
    expect(vm).toMatchObject({ nextPayoutDate: "2026-11-30", nextPayoutIsDefault: false });
    const today = await save({ expectedVersion: 2, nextPayoutDate: "2026-10-10" });
    expect(today).toMatchObject({ nextPayoutDate: "2026-10-10", nextPayoutIsDefault: false });
  });

  it("an unchanged past payout date does not block other edits", async () => {
    const vm = await save({ displayCurrency: "USD" }, noonToronto("2027-01-05"));
    expect(vm).toMatchObject({ displayCurrency: "USD", nextPayoutDate: "2026-12-31", nextPayoutIsDefault: true });
  });

  it("uses today in the NEW time zone", async () => {
    // 2026-10-11 01:00Z: still Oct 10 (21:00) in Toronto, already Oct 11 in Auckland.
    const now = new Date("2026-10-11T01:00:00Z");
    await expectServiceError(save({ nextPayoutDate: "2026-10-10", timeZone: "Pacific/Auckland" }, now), "validation", "nextPayoutDate");
    await expect(save({ nextPayoutDate: "2026-10-10" }, now)).resolves.toMatchObject({ nextPayoutDate: "2026-10-10" });
  });
});

describe("opening obligations", () => {
  const create = (amount = "120.00", effectiveOn = "2026-01-01", label?: string) =>
    createOpening(ctxFor(owner), { idempotencyKey: key(), amount, currency: "CAD", effectiveOn, label });

  it("creates with a default label, updates with optimistic concurrency and deletes softly", async () => {
    const { id } = await create();
    let page = await getSettingsPage(ctxFor(owner));
    expect(page.openings).toEqual([
      expect.objectContaining({ id, amountMinor: 12000, label: "Opening balance", effectiveOn: "2026-01-01", version: 1 }),
    ]);
    expect((await balancesFor(owner)).CAD).toMatchObject({ openingMinor: 12000, accruedMinor: 12000, grossIncomeMinor: 0 });

    const edit = { id, amount: "150.00", currency: "CAD" as const, effectiveOn: "2025-12-31", label: "Owed from 2025" };
    await updateOpening(ctxFor(owner), { idempotencyKey: key(), expectedVersion: 1, ...edit });
    await updateOpening(ctxFor(owner), { idempotencyKey: key(), expectedVersion: 1, ...edit });
    await expectServiceError(
      updateOpening(ctxFor(owner), { idempotencyKey: key(), expectedVersion: 1, ...edit, amount: "1.00" }),
      "stale",
    );
    page = await getSettingsPage(ctxFor(owner));
    expect(page.openings[0]).toMatchObject({ amountMinor: 15000, label: "Owed from 2025", version: 2 });

    await deleteOpening(ctxFor(owner), { idempotencyKey: key(), id, reason: "Paid before" });
    expect(await deleteOpening(ctxFor(owner), { idempotencyKey: key(), id })).toEqual({ id });
    expect((await getSettingsPage(ctxFor(owner))).openings).toEqual([]);
    expect((await balancesFor(owner)).CAD.accruedMinor).toBe(0);
    await expectServiceError(
      updateOpening(ctxFor(owner), { idempotencyKey: key(), expectedVersion: 3, ...edit }),
      "not_found",
    );
    const rows = await withOwner(owner, (tx) => tx.select().from(openingObligation).where(eq(openingObligation.ownerId, owner)));
    expect(rows[0]).toMatchObject({ deletedReason: "Paid before" });
  });

  it("requires currency and a date that is not in the future", async () => {
    await expectServiceError(create("10.00", "2026-10-11"), "validation", "effectiveOn");
    await expectServiceError(
      createOpening(ctxFor(owner), { idempotencyKey: key(), amount: "10.00", currency: undefined as unknown as "CAD", effectiveOn: "2026-01-01" }),
      "validation",
      "currency",
    );
  });
});

describe("settings page read model", () => {
  it("reports account email, 2FA state and time zones", async () => {
    const page = await getSettingsPage(ctxFor(owner));
    expect(page).toMatchObject({ today: "2026-10-10", email: "settings-owner@example.test", twoFactorEnabled: false, earliestIncomeDate: null });
    expect(page.timeZones).toContain("America/Toronto");
    expect(page.timeZones).toContain("UTC");
    expect(page.settings).toEqual(await getSettings(ctxFor(owner)));
  });
});
