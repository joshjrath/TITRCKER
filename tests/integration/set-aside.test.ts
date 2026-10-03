import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { closeDb } from "@/server/db/client";
import { auditEvent, setAsideEntry } from "@/server/db/schema";
import { withOwner } from "@/server/db/with-owner";
import { getGiven } from "@/server/read-models/given";
import { getSetAside } from "@/server/read-models/set-aside";
import { reversePayment } from "@/server/services/payments";
import { createSetAside, deleteSetAside } from "@/server/services/set-aside";

import { createTestUser, resetAppData } from "./helpers/db";
import { addIncome, balancesFor, pay } from "./helpers/ledger";
import { ctxFor, expectServiceError, key } from "./helpers/services";

afterAll(closeDb);

let owner: string;
beforeEach(async () => {
  await resetAppData();
  owner = await createTestUser();
});

const setAside = (kind: "reserve" | "release", amount: string, effectiveOn = "2026-10-07", currency: "CAD" | "USD" = "CAD") =>
  createSetAside(ctxFor(owner), { idempotencyKey: key(), kind, amount, currency, effectiveOn });

const activeEntries = () =>
  withOwner(owner, (tx) =>
    tx
      .select()
      .from(setAsideEntry)
      .where(and(eq(setAsideEntry.ownerId, owner))),
  );

describe("set aside", () => {
  it("the brief's example: outstanding 150.00, set aside 100.00 -> still to set aside 50.00, outstanding unchanged", async () => {
    await addIncome(owner, "1,750.00", "2026-10-05");
    await addIncome(owner, "249.99", "2026-10-05");
    await pay(owner, "50.00", "2026-10-06");
    await setAside("reserve", "100.00");

    const { CAD } = await balancesFor(owner);
    expect(CAD).toMatchObject({ accruedMinor: 20000, stillToGiveMinor: 15000, setAsideMinor: 10000, stillToSetAsideMinor: 5000 });

    const vm = await getSetAside(ctxFor(owner));
    const cad = vm.perCurrency.find((c) => c.currency === "CAD")!;
    expect(cad).toMatchObject({ balanceMinor: 10000, stillToGiveMinor: 15000, stillToSetAsideMinor: 5000 });
    expect(cad.history.map((h) => [h.kind, h.amountMinor, h.runningBalanceMinor])).toEqual([["reserve", 10000, 10000]]);
  });

  it("never lets the running balance go negative (create, backdate, delete)", async () => {
    await expectServiceError(setAside("release", "1.00"), "limit_exceeded", "amount");
    await setAside("reserve", "100.00", "2026-10-07");
    await setAside("release", "60.00", "2026-10-08");
    await expectServiceError(setAside("release", "40.01", "2026-10-09"), "limit_exceeded", "amount");
    // A release dated before the reserve would dip below zero on that date.
    await expectServiceError(setAside("release", "1.00", "2026-10-06"), "limit_exceeded", "amount");
    // Same-day reserve and release: reserve counts first.
    await setAside("reserve", "10.00", "2026-10-09");
    await setAside("release", "50.00", "2026-10-09");

    const vm = await getSetAside(ctxFor(owner));
    expect(vm.perCurrency.find((c) => c.currency === "CAD")!.history.map((h) => h.runningBalanceMinor)).toEqual([
      10000, 4000, 5000, 0,
    ]);

    // Deleting the first reserve would leave the releases uncovered.
    const firstReserve = vm.perCurrency[0]!.history[0]!.id;
    await expectServiceError(deleteSetAside(ctxFor(owner), { idempotencyKey: key(), id: firstReserve }), "limit_exceeded");
    // Currencies are independent.
    await expectServiceError(setAside("release", "1.00", "2026-10-09", "USD"), "limit_exceeded");
  });

  it("deletes entries softly (idempotent, audited) and rejects future dates", async () => {
    const { id } = await setAside("reserve", "25.00");
    await deleteSetAside(ctxFor(owner), { idempotencyKey: key(), id, reason: "Typo" });
    expect(await deleteSetAside(ctxFor(owner), { idempotencyKey: key(), id })).toEqual({ id });
    const rows = await activeEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deletedAt).not.toBeNull();
    expect((await balancesFor(owner)).CAD.setAsideMinor).toBe(0);
    const audits = await withOwner(owner, (tx) =>
      tx.select().from(auditEvent).where(and(eq(auditEvent.ownerId, owner), eq(auditEvent.entityId, id))),
    );
    expect(audits.map((a) => a.action).sort()).toEqual(["create", "delete"]);

    await expectServiceError(setAside("reserve", "1.00", "2026-10-11"), "validation", "effectiveOn");
    await expectServiceError(
      deleteSetAside(ctxFor(owner), { idempotencyKey: key(), id: "00000000-0000-4000-8000-000000000000" }),
      "not_found",
    );
  });
});

describe("drawing a payment from Set aside", () => {
  it("creates a linked release in the same transaction; reversing the payment removes it", async () => {
    await addIncome(owner, "1,000.00", "2026-10-05");
    await setAside("reserve", "80.00", "2026-10-06");

    const { id } = await pay(owner, "50.00", "2026-10-08", { drawFromSetAside: true });
    let entries = (await activeEntries()).filter((e) => e.deletedAt === null);
    expect(entries.map((e) => [e.kind, e.amountMinor, e.paymentId, e.effectiveOn])).toEqual([
      ["reserve", 8000, null, "2026-10-06"],
      ["release", 5000, id, "2026-10-08"],
    ]);
    expect((await balancesFor(owner)).CAD).toMatchObject({ setAsideMinor: 3000, stillToGiveMinor: 5000, stillToSetAsideMinor: 2000 });

    const given = await getGiven(ctxFor(owner));
    expect(given.payments[0]).toMatchObject({ id, linkedSetAsideMinor: 5000, reversedAt: null });

    await reversePayment(ctxFor(owner), { idempotencyKey: key(), id, reason: "Wrong amount" });
    entries = (await activeEntries()).filter((e) => e.deletedAt === null);
    expect(entries.map((e) => e.kind)).toEqual(["reserve"]);
    expect((await balancesFor(owner)).CAD).toMatchObject({ setAsideMinor: 8000, stillToGiveMinor: 10000 });

    const afterReversal = await getGiven(ctxFor(owner));
    expect(afterReversal.payments[0]!.reversedAt).not.toBeNull();
    expect(afterReversal.payments[0]).toMatchObject({ linkedSetAsideMinor: 5000, reversalReason: "Wrong amount" });
  });

  it("takes at most what is available on the paid date, and nothing when the balance is zero", async () => {
    await addIncome(owner, "1,000.00", "2026-10-05");
    await setAside("reserve", "30.00", "2026-10-06");
    await pay(owner, "50.00", "2026-10-08", { drawFromSetAside: true });
    expect((await balancesFor(owner)).CAD.setAsideMinor).toBe(0);

    await pay(owner, "10.00", "2026-10-09", { drawFromSetAside: true });
    const releases = (await activeEntries()).filter((e) => e.kind === "release");
    expect(releases.map((r) => r.amountMinor)).toEqual([3000]);

    // A reserve dated after a backdated payment is not available on the payment date.
    await setAside("reserve", "20.00", "2026-10-09");
    await pay(owner, "5.00", "2026-10-07", { drawFromSetAside: true, today: "2026-10-10" });
    expect((await activeEntries()).filter((e) => e.kind === "release")).toHaveLength(1);
    expect((await balancesFor(owner)).CAD.setAsideMinor).toBe(2000);
  });

  it("is off by default", async () => {
    await addIncome(owner, "1,000.00", "2026-10-05");
    await setAside("reserve", "30.00", "2026-10-06");
    await pay(owner, "20.00", "2026-10-08");
    expect((await balancesFor(owner)).CAD.setAsideMinor).toBe(3000);
  });
});
