import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { closeDb } from "@/server/db/client";
import { withOwner } from "@/server/db/with-owner";
import { buildBackupExport, buildCsvExport } from "@/server/read-models/export";
import { getGiven } from "@/server/read-models/given";
import { getLedger } from "@/server/read-models/ledger";
import { getOverview } from "@/server/read-models/overview";
import { getSetAside } from "@/server/read-models/set-aside";
import { getSettingsPage } from "@/server/read-models/settings";
import { createOpening, deleteOpening, updateOpening } from "@/server/services/opening";
import { reversePayment, updatePaymentDetails } from "@/server/services/payments";
import { createSetAside, deleteSetAside } from "@/server/services/set-aside";
import { getSettings } from "@/server/services/settings";
import { updateSettings } from "@/server/services/settings-update";

import { createTestUser, resetAppData } from "./helpers/db";
import { addIncome, balancesFor, pay } from "./helpers/ledger";
import { ctxFor, expectServiceError, key } from "./helpers/services";

afterAll(closeDb);

let ownerA: string;
let ownerB: string;
let paymentA: string;
let setAsideA: string;
let openingA: string;

beforeEach(async () => {
  await resetAppData();
  ownerA = await createTestUser("a@example.test");
  ownerB = await createTestUser("b@example.test");
  await addIncome(ownerA, "1,000.00", "2026-10-05", { today: "2026-10-10" });
  paymentA = (await pay(ownerA, "40.00", "2026-10-06", { today: "2026-10-10", note: "secret note" })).id;
  setAsideA = (
    await createSetAside(ctxFor(ownerA), { idempotencyKey: key(), kind: "reserve", amount: "25.00", currency: "CAD", effectiveOn: "2026-10-07" })
  ).id;
  openingA = (
    await createOpening(ctxFor(ownerA), { idempotencyKey: key(), amount: "70.00", currency: "CAD", effectiveOn: "2026-01-01", label: "A's debt" })
  ).id;
});

describe("cross-account isolation: payments, set-aside, openings, settings", () => {
  it("owner B cannot touch owner A's records", async () => {
    const b = ctxFor(ownerB);
    await expectServiceError(reversePayment(b, { idempotencyKey: key(), id: paymentA, reason: "x" }), "not_found");
    await expectServiceError(
      updatePaymentDetails(b, { idempotencyKey: key(), id: paymentA, expectedVersion: 1, churchName: "Hijack" }),
      "not_found",
    );
    await expectServiceError(deleteSetAside(b, { idempotencyKey: key(), id: setAsideA }), "not_found");
    await expectServiceError(
      updateOpening(b, { idempotencyKey: key(), id: openingA, expectedVersion: 1, amount: "1.00", currency: "CAD", effectiveOn: "2026-01-01" }),
      "not_found",
    );
    await expectServiceError(deleteOpening(b, { idempotencyKey: key(), id: openingA }), "not_found");
    // B cannot allocate to A's buckets: B has nothing outstanding.
    await expectServiceError(
      pay(ownerB, "10.00", "2026-10-06", { today: "2026-10-10", allocations: [{ bucketYear: 2026, amount: "10.00" }] }),
      "validation",
    );
    // B cannot draw from A's set-aside.
    await pay(ownerB, "10.00", "2026-10-06", { today: "2026-10-10", confirmCredit: true, drawFromSetAside: true });
    expect((await balancesFor(ownerB)).CAD.setAsideMinor).toBe(0);

    await updateSettings(b, {
      idempotencyKey: key(),
      expectedVersion: 1,
      trackingStart: "2026-10-03",
      timeZone: "Europe/London",
      displayCurrency: "USD",
      churchName: "B church",
      nextPayoutDate: "2026-12-31",
    });

    const a = await balancesFor(ownerA);
    expect(a.CAD).toMatchObject({ accruedMinor: 17000, paidMinor: 4000, setAsideMinor: 2500 });
    expect(await getSettings(ctxFor(ownerA))).toMatchObject({ timeZone: "America/Toronto", displayCurrency: "CAD", churchName: "", version: 1 });
  });

  it("owner B's read models and exports contain none of owner A's data", async () => {
    const b = ctxFor(ownerB);
    const overview = await getOverview(b, { period: "all" });
    expect(overview.isEmpty).toBe(true);
    expect(overview.headlines.every((h) => !h.hasActivity && h.accruedMinor === 0)).toBe(true);
    expect((await getLedger(b)).rows).toEqual([]);
    expect((await getGiven(b)).payments).toEqual([]);
    expect((await getSetAside(b)).perCurrency.every((c) => c.history.length === 0)).toBe(true);
    const settings = await getSettingsPage(b);
    expect(settings).toMatchObject({ openings: [], email: "b@example.test", earliestIncomeDate: null });

    const csv = await buildCsvExport(b);
    expect(csv.body).not.toContain(paymentA);
    expect(csv.body).not.toContain("secret note");
    const backup = await buildBackupExport(b);
    expect(backup.backup.account.email).toBe("b@example.test");
    expect(Object.values(backup.backup.records).every((list) => list.length === 0)).toBe(true);
    expect(backup.backup.auditEvents).toEqual([]);

    // Owner A sees their own data.
    const aBackup = await buildBackupExport(ctxFor(ownerA));
    expect(aBackup.backup.records.payments.map((p) => p.id)).toEqual([paymentA]);
    expect((await getSettingsPage(ctxFor(ownerA))).openings.map((o) => o.id)).toEqual([openingA]);
  });

  it("RLS hides owner A's payment, allocation, set-aside and opening rows even without an owner filter", async () => {
    const counts = await withOwner(ownerB, async (tx) => {
      const result = await tx.execute<{ n: string }>(sql`
        SELECT (SELECT count(*) FROM church_payment) + (SELECT count(*) FROM payment_allocation)
             + (SELECT count(*) FROM set_aside_entry) + (SELECT count(*) FROM opening_obligation)
             + (SELECT count(*) FROM app_settings WHERE owner_id <> ${ownerB}) AS n`);
      return Number(result.rows[0]!.n);
    });
    expect(counts).toBe(0);
  });
});
