import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { computeBalances, toLocalDate } from "@/domain";
import { closeDb, getDb } from "@/server/db/client";
import { appSettings, auditEvent, incomeAdjustment, incomeEntry } from "@/server/db/schema";
import { withOwner } from "@/server/db/with-owner";
import {
  createAdjustment,
  createIncome,
  deleteAdjustment,
  deleteIncome,
  earliestActiveIncomeDate,
  restoreIncome,
  updateIncome,
} from "@/server/services/income";
import { getSettings } from "@/server/services/settings";
import { loadActiveSnapshot, loadFullHistory, loadOwnerLedger } from "@/server/services/snapshot";

import { createTestUser, resetAppData } from "./helpers/db";
import { ctxFor, expectServiceError, key } from "./helpers/services";

afterAll(closeDb);

let owner: string;
beforeEach(async () => {
  await resetAppData();
  owner = await createTestUser();
});

const income = (amount: string, extra: Partial<Parameters<typeof createIncome>[1]> = {}) =>
  createIncome(ctxFor(owner), { idempotencyKey: key(), amount, currency: "CAD", receivedOn: "2026-10-05", ...extra });

async function balancesFor(ownerId: string) {
  const ledger = await loadOwnerLedger(ctxFor(ownerId));
  return computeBalances(ledger.snapshot, ledger.tracking.trackingStart);
}

describe("settings", () => {
  it("creates defaults from the domain constants on first use", async () => {
    const settings = await getSettings(ctxFor(owner));
    expect(settings).toMatchObject({
      trackingStart: "2026-10-03",
      timeZone: "America/Toronto",
      displayCurrency: "CAD",
      lastEntryCurrency: "CAD",
      churchName: "",
      nextPayoutDate: "2026-12-31",
      nextPayoutIsDefault: true,
      titheRateBps: 1000,
      roundingPolicy: "HALF_UP_PER_ENTRY_MINOR",
      version: 1,
    });
  });
});

describe("income: the brief's examples", () => {
  it.each([
    ["1,750.00", 175000, 17500],
    ["249.99", 24999, 2500],
    ["0.05", 5, 1],
    ["0.01", 1, 0],
    ["$1750", 175000, 17500],
  ])("%s -> tithe %i minor", async (amount, amountMinor, titheMinor) => {
    const result = await income(amount);
    expect(result).toMatchObject({ currency: "CAD", amountMinor, titheMinor, receivedOn: "2026-10-05" });
    const [row] = await withOwner(owner, (tx) =>
      tx.select().from(incomeEntry).where(and(eq(incomeEntry.ownerId, owner), eq(incomeEntry.id, result.id))),
    );
    expect(row).toMatchObject({ amountMinor, titheMinor, titheRateBps: 1000, roundingPolicy: "HALF_UP_PER_ENTRY_MINOR" });
  });

  it("keeps a 0.01 entry whose tithe is 0.00", async () => {
    await income("0.01");
    const snapshot = await withOwner(owner, (tx) => loadActiveSnapshot(tx, owner));
    expect(snapshot.incomes).toHaveLength(1);
    expect(snapshot.incomes[0]).toMatchObject({ amountMinor: 1, titheMinor: 0 });
  });

  it("totals 1,750.00 + 249.99 as income 1,999.99 and accrued 200.00 (per-entry rounding)", async () => {
    await income("1,750.00");
    await income("249.99");
    const { CAD, USD } = await balancesFor(owner);
    expect(CAD.grossIncomeMinor).toBe(199999);
    expect(CAD.netIncomeMinor).toBe(199999);
    expect(CAD.accruedMinor).toBe(20000);
    expect(CAD.stillToGiveMinor).toBe(20000);
    expect(USD.hasActivity).toBe(false);
  });

  it("stores optional text trimmed (blank -> null) and remembers the last entry currency", async () => {
    const result = await income("10.00", { currency: "USD", source: "  Salary  ", category: "", note: "line 1\r\nline 2" });
    const [row] = await withOwner(owner, (tx) =>
      tx.select().from(incomeEntry).where(and(eq(incomeEntry.ownerId, owner), eq(incomeEntry.id, result.id))),
    );
    expect(row).toMatchObject({ source: "Salary", category: null, note: "line 1\nline 2", currency: "USD" });
    expect((await getSettings(ctxFor(owner))).lastEntryCurrency).toBe("USD");
  });

  it("audits creation with an after snapshot", async () => {
    const result = await income("100.00");
    const events = await withOwner(owner, (tx) =>
      tx.select().from(auditEvent).where(and(eq(auditEvent.ownerId, owner), eq(auditEvent.entityId, result.id))),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ entityType: "income", action: "create", before: null });
    expect(events[0]!.after).toMatchObject({ amountMinor: 10000, titheMinor: 1000 });
  });
});

describe("income: validation", () => {
  it.each([
    ["0", "zero"],
    ["0.00", "zero"],
    ["-5.00", "negative"],
    ["1.234", "too many decimals"],
    ["1,000,000,000.00", "too large"],
    ["1e5", "scientific"],
    ["1,75.00", "bad grouping"],
    ["", "empty"],
  ])("rejects amount %j (%s)", async (amount) => {
    await expectServiceError(income(amount), "validation", "amount");
  });

  it("accepts the maximum 999,999,999.99", async () => {
    const result = await income("999,999,999.99");
    expect(result).toMatchObject({ amountMinor: 99999999999, titheMinor: 10000000000 });
  });

  it("rejects a future received date (owner's local today)", async () => {
    await expectServiceError(income("10.00", { receivedOn: "2026-10-11" }), "validation", "receivedOn");
    // 2026-10-11 03:30Z is still Oct 10 in Toronto, so Oct 11 is still the future there.
    await expectServiceError(
      createIncome(ctxFor(owner, new Date("2026-10-11T03:30:00Z")), {
        idempotencyKey: key(),
        amount: "1",
        currency: "CAD",
        receivedOn: "2026-10-11",
      }),
      "validation",
      "receivedOn",
    );
    expect(await income("10.00", { receivedOn: "2026-10-10" })).toMatchObject({ receivedOn: "2026-10-10" });
  });

  it("rejects a date before the tracking start", async () => {
    await expectServiceError(income("10.00", { receivedOn: "2026-10-02" }), "validation", "receivedOn");
    expect(await income("10.00", { receivedOn: "2026-10-03" })).toMatchObject({ receivedOn: "2026-10-03" });
  });

  it("rejects invalid dates, currencies, keys and over-long or control-character text", async () => {
    await expectServiceError(income("1", { receivedOn: "2026-02-30" }), "validation", "receivedOn");
    await expectServiceError(income("1", { currency: "EUR" as "CAD" }), "validation", "currency");
    await expectServiceError(income("1", { idempotencyKey: "not-a-uuid" }), "validation", "idempotencyKey");
    await expectServiceError(income("1", { source: "x".repeat(121) }), "validation", "source");
    await expectServiceError(income("1", { source: "bad\u0007bell" }), "validation", "source");
    await expectServiceError(income("1", { source: "two\nlines" }), "validation", "source");
    await expectServiceError(income("1", { note: "tab\there" }), "validation", "note");
  });

  it("writes nothing when validation fails", async () => {
    await income("0").catch(() => undefined);
    const rows = await withOwner(owner, (tx) => tx.select().from(incomeEntry).where(eq(incomeEntry.ownerId, owner)));
    expect(rows).toHaveLength(0);
  });
});

describe("income: updates and optimistic concurrency", () => {
  it("updates values, recomputes the tithe and bumps the version", async () => {
    const created = await income("100.00");
    const updated = await updateIncome(ctxFor(owner), {
      idempotencyKey: key(),
      id: created.id,
      expectedVersion: 1,
      amount: "249.99",
      currency: "CAD",
      receivedOn: "2026-10-06",
      source: "Bonus",
    });
    expect(updated).toMatchObject({ amountMinor: 24999, titheMinor: 2500, receivedOn: "2026-10-06" });
    const ledger = await loadOwnerLedger(ctxFor(owner));
    expect(ledger.snapshot.incomes[0]).toMatchObject({ version: 2, source: "Bonus" });
    const events = await withOwner(owner, (tx) =>
      tx.select().from(auditEvent).where(and(eq(auditEvent.ownerId, owner), eq(auditEvent.action, "update"))),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.before).toMatchObject({ amountMinor: 10000 });
    expect(events[0]!.after).toMatchObject({ amountMinor: 24999, version: 2 });
  });

  it("rejects a stale version, but treats an already-applied identical edit as success", async () => {
    const created = await income("100.00");
    const edit = { id: created.id, amount: "200.00", currency: "CAD" as const, receivedOn: "2026-10-05" };
    await updateIncome(ctxFor(owner), { idempotencyKey: key(), expectedVersion: 1, ...edit });

    // Same values again with the old version (e.g. a second tab): no-op success.
    const again = await updateIncome(ctxFor(owner), { idempotencyKey: key(), expectedVersion: 1, ...edit });
    expect(again).toMatchObject({ amountMinor: 20000 });

    // Different values with the old version: stale.
    await expectServiceError(
      updateIncome(ctxFor(owner), { idempotencyKey: key(), expectedVersion: 1, ...edit, amount: "300.00" }),
      "stale",
    );
    const ledger = await loadOwnerLedger(ctxFor(owner));
    expect(ledger.snapshot.incomes[0]).toMatchObject({ amountMinor: 20000, version: 2 });
  });

  it("applies the same date rules on edit", async () => {
    const created = await income("100.00");
    const base = { id: created.id, expectedVersion: 1, amount: "100.00", currency: "CAD" as const };
    await expectServiceError(
      updateIncome(ctxFor(owner), { idempotencyKey: key(), ...base, receivedOn: "2026-10-12" }),
      "validation",
      "receivedOn",
    );
    await expectServiceError(
      updateIncome(ctxFor(owner), { idempotencyKey: key(), ...base, receivedOn: "2026-09-30" }),
      "validation",
      "receivedOn",
    );
  });
});

describe("refunds", () => {
  const refund = (incomeId: string, amount: string, effectiveOn = "2026-10-08", reason = "Returned") =>
    createAdjustment(ctxFor(owner), { idempotencyKey: key(), incomeId, kind: "refund", amount, effectiveOn, reason });

  it("handles partial and multiple refunds with telescoping tithe deltas", async () => {
    const { id } = await income("249.99"); // tithe 25.00
    const first = await refund(id, "100.00"); // tithe(149.99) = 15.00 -> delta -10.00
    expect(first.titheDeltaMinor).toBe(-1000);
    const second = await refund(id, "49.99", "2026-10-09"); // tithe(100.00) = 10.00 -> delta -5.00
    expect(second.titheDeltaMinor).toBe(-500);
    const { CAD } = await balancesFor(owner);
    expect(CAD.grossIncomeMinor).toBe(24999);
    expect(CAD.refundedMinor).toBe(14999);
    expect(CAD.netIncomeMinor).toBe(10000);
    expect(CAD.accruedMinor).toBe(1000);
  });

  it("a full refund reverses exactly the original tithe", async () => {
    const { id } = await income("0.05"); // tithe 0.01
    const r1 = await refund(id, "0.02"); // tithe(0.03)=0.00 -> -0.01
    const r2 = await refund(id, "0.03", "2026-10-09"); // tithe(0)=0 -> 0
    expect(r1.titheDeltaMinor + r2.titheDeltaMinor).toBe(-1);
    const { CAD } = await balancesFor(owner);
    expect(CAD.accruedMinor).toBe(0);
    expect(CAD.netIncomeMinor).toBe(0);
  });

  it("rejects refunds over the remaining amount", async () => {
    const { id } = await income("100.00");
    await refund(id, "60.00");
    await expectServiceError(refund(id, "40.01"), "limit_exceeded", "amount");
    await refund(id, "40.00");
    await expectServiceError(refund(id, "0.01"), "limit_exceeded", "amount");
  });

  it("validates the refund date and reason", async () => {
    const { id } = await income("100.00", { receivedOn: "2026-10-05" });
    await expectServiceError(refund(id, "1.00", "2026-10-04"), "validation", "effectiveOn");
    await expectServiceError(refund(id, "1.00", "2026-10-11"), "validation", "effectiveOn");
    await expectServiceError(refund(id, "1.00", "2026-10-06", "   "), "validation", "reason");
    expect((await refund(id, "1.00", "2026-10-05")).titheDeltaMinor).toBe(-10);
  });

  it("an edit cannot lower the amount below refunds or move the date past the earliest refund", async () => {
    const { id } = await income("100.00", { receivedOn: "2026-10-05" });
    await refund(id, "30.00", "2026-10-07");
    const base = { id, expectedVersion: 1, currency: "CAD" as const };
    await expectServiceError(
      updateIncome(ctxFor(owner), { idempotencyKey: key(), ...base, amount: "29.99", receivedOn: "2026-10-05" }),
      "validation",
      "amount",
    );
    await expectServiceError(
      updateIncome(ctxFor(owner), { idempotencyKey: key(), ...base, amount: "100.00", receivedOn: "2026-10-08" }),
      "validation",
      "receivedOn",
    );
    const ok = await updateIncome(ctxFor(owner), { idempotencyKey: key(), ...base, amount: "30.00", receivedOn: "2026-10-07" });
    expect(ok).toMatchObject({ amountMinor: 3000, titheMinor: 300 });
    const { CAD } = await balancesFor(owner);
    expect(CAD.accruedMinor).toBe(0);
  });

  it("deleting a refund restores the tithe; deletes are idempotent", async () => {
    const { id } = await income("100.00");
    const r = await refund(id, "50.00");
    expect((await balancesFor(owner)).CAD.accruedMinor).toBe(500);
    await deleteAdjustment(ctxFor(owner), { idempotencyKey: key(), id: r.id, reason: "Entered by mistake" });
    await deleteAdjustment(ctxFor(owner), { idempotencyKey: key(), id: r.id });
    expect((await balancesFor(owner)).CAD.accruedMinor).toBe(1000);
    const [row] = await withOwner(owner, (tx) =>
      tx.select().from(incomeAdjustment).where(and(eq(incomeAdjustment.ownerId, owner), eq(incomeAdjustment.id, r.id))),
    );
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.deletedReason).toBe("Entered by mistake");
  });

  it("cannot refund a deleted income", async () => {
    const { id } = await income("100.00");
    await deleteIncome(ctxFor(owner), { idempotencyKey: key(), id });
    await expectServiceError(refund(id, "1.00"), "not_found");
  });
});

describe("soft delete and restore", () => {
  it("excludes deleted income from totals but keeps the row and its audit history", async () => {
    const keep = await income("1,750.00");
    const gone = await income("249.99");
    await deleteIncome(ctxFor(owner), { idempotencyKey: key(), id: gone.id, reason: "Duplicate" });

    const { CAD } = await balancesFor(owner);
    expect(CAD.grossIncomeMinor).toBe(175000);
    expect(CAD.accruedMinor).toBe(17500);

    const history = await withOwner(owner, (tx) => loadFullHistory(tx, owner));
    const deleted = history.records.incomes.find((r) => r.id === gone.id);
    expect(deleted).toMatchObject({ deletedReason: "Duplicate" });
    expect(deleted?.deletedAt).toBeTruthy();
    expect(history.records.incomes.map((r) => r.id).sort()).toEqual([keep.id, gone.id].sort());
    const actions = history.auditEvents.filter((e) => e.entityId === gone.id).map((e) => e.action);
    expect(actions.sort()).toEqual(["create", "delete"]);

    // Idempotent: deleting again succeeds without a second audit event.
    await deleteIncome(ctxFor(owner), { idempotencyKey: key(), id: gone.id });
    const again = await withOwner(owner, (tx) => loadFullHistory(tx, owner));
    expect(again.auditEvents.filter((e) => e.entityId === gone.id)).toHaveLength(2);
  });

  it("restores a deleted entry (undo), including its refunds", async () => {
    const { id } = await income("100.00");
    await createAdjustment(ctxFor(owner), {
      idempotencyKey: key(),
      incomeId: id,
      kind: "refund",
      amount: "50.00",
      effectiveOn: "2026-10-06",
      reason: "Partial return",
    });
    await deleteIncome(ctxFor(owner), { idempotencyKey: key(), id });
    expect((await balancesFor(owner)).CAD.accruedMinor).toBe(0);
    await restoreIncome(ctxFor(owner), { idempotencyKey: key(), id });
    await restoreIncome(ctxFor(owner), { idempotencyKey: key(), id });
    const { CAD } = await balancesFor(owner);
    expect(CAD.accruedMinor).toBe(500);
    expect(CAD.refundedMinor).toBe(5000);
    const history = await withOwner(owner, (tx) => loadFullHistory(tx, owner));
    expect(history.auditEvents.filter((e) => e.entityId === id && e.action === "restore")).toHaveLength(1);
  });

  it("a restored entry must still be on/after the tracking start", async () => {
    const { id } = await income("100.00", { receivedOn: "2026-10-03" });
    await deleteIncome(ctxFor(owner), { idempotencyKey: key(), id });
    await withOwner(owner, (tx) =>
      tx.update(appSettings).set({ trackingStart: "2026-10-04" }).where(eq(appSettings.ownerId, owner)),
    );
    await expectServiceError(restoreIncome(ctxFor(owner), { idempotencyKey: key(), id }), "validation", "receivedOn");
  });

  it("updating a deleted entry is not_found", async () => {
    const { id } = await income("100.00");
    await deleteIncome(ctxFor(owner), { idempotencyKey: key(), id });
    await expectServiceError(
      updateIncome(ctxFor(owner), {
        idempotencyKey: key(),
        id,
        expectedVersion: 2,
        amount: "5",
        currency: "CAD",
        receivedOn: toLocalDate("2026-10-05"),
      }),
      "not_found",
    );
  });

  it("unknown ids are not_found", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    await expectServiceError(deleteIncome(ctxFor(owner), { idempotencyKey: key(), id: missing }), "not_found");
    await expectServiceError(restoreIncome(ctxFor(owner), { idempotencyKey: key(), id: missing }), "not_found");
    await expectServiceError(deleteAdjustment(ctxFor(owner), { idempotencyKey: key(), id: missing }), "not_found");
  });
});

describe("db access", () => {
  it("reports the earliest active income date as a local date string", async () => {
    expect(await withOwner(owner, (tx) => earliestActiveIncomeDate(tx, owner))).toBeNull();
    const early = await income("1.00", { receivedOn: "2026-10-04" });
    await income("1.00", { receivedOn: "2026-10-07" });
    expect(await withOwner(owner, (tx) => earliestActiveIncomeDate(tx, owner))).toBe("2026-10-04");
    await deleteIncome(ctxFor(owner), { idempotencyKey: key(), id: early.id });
    expect(await withOwner(owner, (tx) => earliestActiveIncomeDate(tx, owner))).toBe("2026-10-07");
  });

  it("uses the test database", async () => {
    const rows = await getDb().select().from(incomeEntry);
    expect(rows).toHaveLength(0); // RLS: no owner set outside withOwner
  });
});
