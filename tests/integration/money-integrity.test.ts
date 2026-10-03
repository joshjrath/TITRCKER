/**
 * Adversarial money-integrity review (ARCHITECTURE §3, §5, §6): genuinely concurrent requests against the
 * real database, audit coverage for every mutation, soft deletes excluded from every read model, and
 * consistent (single-snapshot) reads.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { setAsideHistory, sumMinor } from "@/domain";
import { closeDb } from "@/server/db/client";
import { auditEvent, incomeEntry, paymentAllocation, setAsideEntry } from "@/server/db/schema";
import { readSettingsRow, withOwner, withOwnerSnapshot } from "@/server/db/with-owner";
import { buildBackupExport, buildCsvExport } from "@/server/read-models/export";
import { getGiven } from "@/server/read-models/given";
import { getLedger } from "@/server/read-models/ledger";
import { getOverview } from "@/server/read-models/overview";
import { getSetAside } from "@/server/read-models/set-aside";
import { getSettingsPage } from "@/server/read-models/settings";
import { ServiceError } from "@/server/services/errors";
import {
  createAdjustment,
  createIncome,
  deleteAdjustment,
  deleteIncome,
  restoreIncome,
  updateIncome,
} from "@/server/services/income";
import { createOpening, deleteOpening, updateOpening } from "@/server/services/opening";
import { recordPayment, reversePayment, updatePaymentDetails } from "@/server/services/payments";
import { createSetAside, deleteSetAside } from "@/server/services/set-aside";
import { getSettings } from "@/server/services/settings";
import { updateSettings } from "@/server/services/settings-update";

import { createTestUser, resetAppData } from "./helpers/db";
import { addIncome, balancesFor, bucketsFor, pay } from "./helpers/ledger";
import { ctxFor, key } from "./helpers/services";

afterAll(closeDb);

let owner: string;
beforeEach(async () => {
  await resetAppData();
  owner = await createTestUser();
});

const ctx = () => ctxFor(owner);

/** Splits settled promises into fulfilled values and ServiceError codes (anything else fails the test). */
function outcomes<T>(results: PromiseSettledResult<T>[]): { ok: T[]; codes: string[] } {
  const ok: T[] = [];
  const codes: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") ok.push(r.value);
    else if (r.reason instanceof ServiceError) codes.push(r.reason.code);
    else throw r.reason;
  }
  return { ok, codes: codes.sort() };
}

const auditRows = () =>
  withOwner(owner, (tx) =>
    tx.select().from(auditEvent).where(eq(auditEvent.ownerId, owner)).orderBy(auditEvent.createdAt, auditEvent.id),
  );

function setAside(kind: "reserve" | "release", amount: string, effectiveOn = "2026-10-05") {
  return createSetAside(ctx(), { idempotencyKey: key(), kind, amount, currency: "CAD", effectiveOn });
}

async function assertSetAsideNeverNegative(): Promise<void> {
  const rows = await withOwner(owner, (tx) =>
    tx.select().from(setAsideEntry).where(eq(setAsideEntry.ownerId, owner)),
  );
  const active = rows
    .filter((r) => r.deletedAt === null)
    .map((r) => ({
      id: r.id,
      currency: r.currency as "CAD",
      kind: r.kind as "reserve" | "release",
      amountMinor: r.amountMinor,
      effectiveOn: r.effectiveOn,
      note: r.note,
      paymentId: r.paymentId,
      createdAt: r.createdAt.toISOString(),
    }));
  for (const entry of setAsideHistory(active as never, "CAD")) {
    expect(entry.runningBalanceMinor, `running balance after ${entry.id}`).toBeGreaterThanOrEqual(0);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Concurrency: every case below fires its requests at the same time (Promise.allSettled), so they really
// contend for the owner's settings lock on separate pool connections.
// ---------------------------------------------------------------------------------------------------------

describe("concurrency: limits hold under simultaneous requests", () => {
  it("explicit allocations racing for one bucket: exactly one wins, the bucket is never over-allocated", async () => {
    await addIncome(owner, "1,000.00", "2026-10-05", { today: "2026-10-10" }); // accrued 100.00
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        pay(owner, "100.00", "2026-10-08", { today: "2026-10-10", allocations: [{ bucketYear: 2026, amount: "100.00" }] }),
      ),
    );
    const { ok, codes } = outcomes(results);
    expect(ok).toHaveLength(1);
    expect(codes).toEqual(["validation", "validation", "validation", "validation"]);
    expect(await bucketsFor(owner)).toEqual({ 2026: { accrued: 10000, allocated: 10000, creditApplied: 0, outstanding: 0 } });
  });

  it("auto allocations racing: later payments see the earlier ones (post-credit outstanding) and need credit confirmation", async () => {
    await addIncome(owner, "1,000.00", "2026-10-05", { today: "2026-10-10" }); // accrued 100.00
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => pay(owner, "30.00", "2026-10-08", { today: "2026-10-10" })),
    );
    const { ok, codes } = outcomes(results);
    // 30 + 30 + 30 fit; the 4th would leave 20.00 unallocated and the 5th is all credit: both need confirmCredit.
    expect(ok).toHaveLength(3);
    expect(codes).toEqual(["validation", "validation"]);
    const allocations = await withOwner(owner, (tx) =>
      tx.select().from(paymentAllocation).where(eq(paymentAllocation.ownerId, owner)),
    );
    expect(sumMinor(allocations.map((a) => a.amountMinor) as never)).toBe(9000);
    expect((await balancesFor(owner)).CAD).toMatchObject({ stillToGiveMinor: 1000, creditMinor: 0 });
  });

  it("set-aside releases racing for the same balance never take it below zero", async () => {
    await setAside("reserve", "100.00");
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => setAside("release", "30.00", "2026-10-06")));
    const { ok, codes } = outcomes(results);
    expect(ok).toHaveLength(3);
    expect(codes).toEqual(["limit_exceeded", "limit_exceeded"]);
    expect((await balancesFor(owner)).CAD.setAsideMinor).toBe(1000);
    await assertSetAsideNeverNegative();
  });

  it("drawing a payment from Set aside while the reserve is deleted keeps the history non-negative", async () => {
    await addIncome(owner, "1,000.00", "2026-10-05", { today: "2026-10-10" });
    for (let round = 0; round < 4; round += 1) {
      const reserve = await setAside("reserve", "100.00", "2026-10-05");
      const [payment, deletion] = await Promise.allSettled([
        pay(owner, "25.00", "2026-10-06", { today: "2026-10-10", drawFromSetAside: true, confirmCredit: true }),
        deleteSetAside(ctx(), { idempotencyKey: key(), id: reserve.id }),
      ]);
      expect(payment.status).toBe("fulfilled");
      if (deletion.status === "rejected") expect((deletion.reason as ServiceError).code).toBe("limit_exceeded");
      await assertSetAsideNeverNegative();
    }
    expect((await balancesFor(owner)).CAD.setAsideMinor).toBeGreaterThanOrEqual(0);
  });

  it("concurrent refunds with distinct keys never exceed the received amount", async () => {
    const income = await addIncome(owner, "100.00", "2026-10-05", { today: "2026-10-10" });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        createAdjustment(ctx(), {
          idempotencyKey: key(),
          incomeId: income.id,
          kind: "refund",
          amount: "40.00",
          effectiveOn: "2026-10-06",
          reason: "Returned",
        }),
      ),
    );
    const { ok, codes } = outcomes(results);
    expect(ok).toHaveLength(2);
    expect(codes).toEqual(Array(4).fill("limit_exceeded"));
    const ledger = await getLedger(ctx());
    expect(ledger.rows[0]).toMatchObject({ refundedMinor: 8000, netAmountMinor: 2000, netTitheMinor: 200 });
  });

  it("a refund racing a downward edit of the same entry cannot leave refunds above the amount", async () => {
    for (let round = 0; round < 4; round += 1) {
      const income = await addIncome(owner, "100.00", "2026-10-05", { today: "2026-10-10" });
      await Promise.allSettled([
        createAdjustment(ctx(), {
          idempotencyKey: key(),
          incomeId: income.id,
          kind: "refund",
          amount: "80.00",
          effectiveOn: "2026-10-06",
          reason: "Returned",
        }),
        updateIncome(ctx(), {
          idempotencyKey: key(),
          id: income.id,
          expectedVersion: 1,
          amount: "50.00",
          currency: "CAD",
          receivedOn: "2026-10-05",
        }),
      ]);
      const row = (await getLedger(ctx())).rows.find((r) => r.id === income.id)!;
      expect(row.refundedMinor).toBeLessThanOrEqual(row.amountMinor);
      expect(row.netTitheMinor).toBeGreaterThanOrEqual(0);
    }
  });

  it("moving the tracking start forward while income is recorded never leaves income before the tracking start", async () => {
    for (let round = 0; round < 4; round += 1) {
      await resetAppData();
      owner = await createTestUser();
      const settings = await getSettings(ctx());
      await Promise.allSettled([
        updateSettings(ctx(), {
          idempotencyKey: key(),
          expectedVersion: settings.version,
          trackingStart: "2026-10-06",
          timeZone: settings.timeZone,
          displayCurrency: settings.displayCurrency,
          churchName: null,
          nextPayoutDate: settings.nextPayoutDate,
        }),
        addIncome(owner, "10.00", "2026-10-04", { today: "2026-10-10" }),
      ]);
      const after = await getSettings(ctx());
      const incomes = await withOwner(owner, (tx) => tx.select().from(incomeEntry).where(eq(incomeEntry.ownerId, owner)));
      for (const income of incomes) expect(income.receivedOn >= after.trackingStart).toBe(true);
      expect(incomes.length === 1 || after.trackingStart === "2026-10-06").toBe(true);
    }
  });

  it("concurrent edits with the same expectedVersion: one wins, the rest are stale", async () => {
    const income = await addIncome(owner, "100.00", "2026-10-05", { today: "2026-10-10" });
    const results = await Promise.allSettled(
      ["101.00", "102.00", "103.00", "104.00"].map((amount) =>
        updateIncome(ctx(), { idempotencyKey: key(), id: income.id, expectedVersion: 1, amount, currency: "CAD", receivedOn: "2026-10-05" }),
      ),
    );
    const { ok, codes } = outcomes(results);
    expect(ok).toHaveLength(1);
    expect(codes).toEqual(["stale", "stale", "stale"]);
    const [row] = (await getLedger(ctx())).rows;
    expect(row).toMatchObject({ version: 2, amountMinor: ok[0]!.amountMinor });
    const updates = (await auditRows()).filter((a) => a.action === "update");
    expect(updates).toHaveLength(1);
  });

  it("the same key sent concurrently with two different payloads: one row, the other is an idempotency_conflict", async () => {
    const k = key();
    const results = await Promise.allSettled(
      ["1.00", "2.00"].map((amount) => createIncome(ctx(), { idempotencyKey: k, amount, currency: "CAD", receivedOn: "2026-10-05" })),
    );
    const { ok, codes } = outcomes(results);
    expect(ok).toHaveLength(1);
    expect(codes).toEqual(["idempotency_conflict"]);
    expect((await getLedger(ctx())).rows).toHaveLength(1);
  });

  it("a double-submitted payment drawn from Set aside creates one payment and one linked release", async () => {
    await addIncome(owner, "1,000.00", "2026-10-05", { today: "2026-10-10" });
    await setAside("reserve", "100.00");
    const input = {
      idempotencyKey: key(),
      amount: "40.00",
      currency: "CAD" as const,
      paidOn: "2026-10-07",
      churchName: "Grace",
      allocations: "auto" as const,
      confirmCredit: false,
      confirmMadePayment: true,
      drawFromSetAside: true,
    };
    const results = await Promise.all(Array.from({ length: 5 }, () => recordPayment(ctx(), input)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    const releases = await withOwner(owner, (tx) =>
      tx.select().from(setAsideEntry).where(and(eq(setAsideEntry.ownerId, owner), eq(setAsideEntry.kind, "release"))),
    );
    expect(releases).toHaveLength(1);
    expect((await balancesFor(owner)).CAD).toMatchObject({ paidMinor: 4000, setAsideMinor: 6000 });
  });

  it("concurrent reversals (distinct keys) reverse once and remove the linked release once", async () => {
    await addIncome(owner, "1,000.00", "2026-10-05", { today: "2026-10-10" });
    await setAside("reserve", "100.00");
    const payment = await pay(owner, "40.00", "2026-10-07", { today: "2026-10-10", drawFromSetAside: true });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => reversePayment(ctx(), { idempotencyKey: key(), id: payment.id, reason: "Duplicate" })),
    );
    expect(results.every((r) => r.id === payment.id)).toBe(true);
    const audits = await auditRows();
    expect(audits.filter((a) => a.action === "reverse")).toHaveLength(1);
    expect(audits.filter((a) => a.entityType === "set_aside" && a.action === "delete")).toHaveLength(1);
    expect((await balancesFor(owner)).CAD).toMatchObject({ paidMinor: 0, setAsideMinor: 10000, stillToGiveMinor: 10000 });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Audit coverage
// ---------------------------------------------------------------------------------------------------------

describe("audit coverage", () => {
  it("every create/update/delete/restore/reverse writes one audit event; no-ops and replays write none", async () => {
    const c = ctx();
    const income = await createIncome(c, { idempotencyKey: key(), amount: "500.00", currency: "CAD", receivedOn: "2026-10-05" });
    await updateIncome(c, { idempotencyKey: key(), id: income.id, expectedVersion: 1, amount: "600.00", currency: "CAD", receivedOn: "2026-10-05" });
    // identical edit (no-op) and a replay of the same key: no new events
    await updateIncome(c, { idempotencyKey: key(), id: income.id, expectedVersion: 2, amount: "600.00", currency: "CAD", receivedOn: "2026-10-05" });
    const adjKey = key();
    const adjustmentInput = { idempotencyKey: adjKey, incomeId: income.id, kind: "refund" as const, amount: "10.00", effectiveOn: "2026-10-06", reason: "Returned" };
    const adjustment = await createAdjustment(c, adjustmentInput);
    await createAdjustment(c, adjustmentInput);
    await deleteAdjustment(c, { idempotencyKey: key(), id: adjustment.id, reason: "Mistake" });
    await deleteAdjustment(c, { idempotencyKey: key(), id: adjustment.id }); // already deleted: idempotent
    await deleteIncome(c, { idempotencyKey: key(), id: income.id, reason: "Mistake" });
    await restoreIncome(c, { idempotencyKey: key(), id: income.id });

    const opening = await createOpening(c, { idempotencyKey: key(), amount: "20.00", currency: "CAD", effectiveOn: "2026-01-01" });
    await updateOpening(c, { idempotencyKey: key(), id: opening.id, expectedVersion: 1, amount: "25.00", currency: "CAD", effectiveOn: "2026-01-01" });
    await deleteOpening(c, { idempotencyKey: key(), id: opening.id });

    const reserve = await setAside("reserve", "30.00");
    const payment = await pay(owner, "10.00", "2026-10-07", { today: "2026-10-10", drawFromSetAside: true });
    await updatePaymentDetails(c, { idempotencyKey: key(), id: payment.id, expectedVersion: 1, churchName: "Grace Chapel", reference: "chq 12" });
    await reversePayment(c, { idempotencyKey: key(), id: payment.id, reason: "Wrong amount" });
    await reversePayment(c, { idempotencyKey: key(), id: payment.id, reason: "Again" });
    await deleteSetAside(c, { idempotencyKey: key(), id: reserve.id });

    const settings = await getSettings(c);
    await updateSettings(c, {
      idempotencyKey: key(),
      expectedVersion: settings.version,
      trackingStart: settings.trackingStart,
      timeZone: settings.timeZone,
      displayCurrency: "USD",
      churchName: "Grace",
      nextPayoutDate: settings.nextPayoutDate,
    });

    const audits = await auditRows();
    expect(audits.map((a) => `${a.entityType}:${a.action}`)).toEqual([
      "income:create",
      "income:update",
      "adjustment:create",
      "adjustment:delete",
      "income:delete",
      "income:restore",
      "opening:create",
      "opening:update",
      "opening:delete",
      "set_aside:create",
      "payment:create",
      "set_aside:create", // linked release
      "payment:update",
      "payment:reverse",
      "set_aside:delete", // linked release removed by the reversal
      "set_aside:delete",
      "settings:update",
    ]);
    for (const a of audits) {
      expect(a.after, `${a.entityType}:${a.action} after`).not.toBeNull();
      if (a.action === "create") expect(a.before).toBeNull();
      else expect(a.before, `${a.entityType}:${a.action} before`).not.toBeNull();
    }
    expect(audits.find((a) => a.action === "reverse")?.reason).toBe("Wrong amount");
  });
});

// ---------------------------------------------------------------------------------------------------------
// Soft deletes excluded from every active total and view
// ---------------------------------------------------------------------------------------------------------

describe("soft-deleted and reversed records are excluded everywhere", () => {
  it("overview (headline, period, chart, monthly, recent), ledger, given, set aside, settings and exports", async () => {
    const c = ctx();
    const kept = await addIncome(owner, "1,000.00", "2026-10-04", { today: "2026-10-10" });
    const gone = await addIncome(owner, "500.00", "2026-10-05", { today: "2026-10-10" });
    await createAdjustment(c, { idempotencyKey: key(), incomeId: gone.id, kind: "refund", amount: "100.00", effectiveOn: "2026-10-06", reason: "r" });
    const keptRefund = await createAdjustment(c, { idempotencyKey: key(), incomeId: kept.id, kind: "refund", amount: "1.00", effectiveOn: "2026-10-06", reason: "r" });
    await deleteAdjustment(c, { idempotencyKey: key(), id: keptRefund.id });
    const opening = await createOpening(c, { idempotencyKey: key(), amount: "20.00", currency: "CAD", effectiveOn: "2026-10-04" });
    const reserve = await setAside("reserve", "7.00");
    const payment = await pay(owner, "5.00", "2026-10-07", { today: "2026-10-10" });

    await deleteIncome(c, { idempotencyKey: key(), id: gone.id });
    await deleteOpening(c, { idempotencyKey: key(), id: opening.id });
    await reversePayment(c, { idempotencyKey: key(), id: payment.id, reason: "Undo" });
    await deleteSetAside(c, { idempotencyKey: key(), id: reserve.id });

    const overview = await getOverview(c, { period: "2026" });
    const cad = overview.headlines.find((h) => h.currency === "CAD")!;
    expect(cad).toMatchObject({ accruedMinor: 10000, paidMinor: 0, netIncomeMinor: 100000, setAsideMinor: 0, stillToGiveMinor: 10000 });
    expect(overview.periodSummary).toMatchObject({ grossIncomeMinor: 100000, refundedMinor: 0, accruedMinor: 10000, givenMinor: 0, entryCount: 1 });
    expect(overview.chart.endValueMinor).toBe(10000);
    expect(overview.chart.givenEndValueMinor).toBe(0);
    expect(sumMinor(overview.monthly.map((m) => m.titheMinor))).toBe(10000);
    expect(sumMinor(overview.monthly.map((m) => m.netIncomeMinor))).toBe(100000);
    expect(sumMinor(overview.monthly.map((m) => m.paidMinor))).toBe(0);
    expect(overview.recent.map((r) => r.id)).toEqual([kept.id]);
    expect(overview.recent[0]!.adjustments).toEqual([]);

    const ledger = await getLedger(c);
    expect(ledger.rows.map((r) => r.id)).toEqual([kept.id]);

    const given = await getGiven(c);
    expect(given.bucketsByCurrency.CAD.map((b) => [b.year, b.accruedMinor, b.allocatedMinor, b.outstandingMinor])).toEqual([
      [2026, 10000, 0, 10000],
    ]);
    expect(given.payments.map((p) => [p.id, p.reversedAt !== null])).toEqual([[payment.id, true]]);

    const setAsidePage = await getSetAside(c);
    expect(setAsidePage.perCurrency.find((p) => p.currency === "CAD")).toMatchObject({ balanceMinor: 0, history: [] });

    const settingsPage = await getSettingsPage(c);
    expect(settingsPage.openings).toEqual([]);

    const { body } = await buildCsvExport(c);
    for (const id of [gone.id, opening.id, payment.id, reserve.id, keptRefund.id]) expect(body).not.toContain(id);
    expect(body).toContain(kept.id);

    const { backup } = await buildBackupExport(c);
    expect(backup.totals.CAD).toMatchObject({ accruedMinor: 10000, paidMinor: 0, stillToGiveMinor: 10000 });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Consistent reads
// ---------------------------------------------------------------------------------------------------------

describe("read models read one consistent snapshot", () => {
  it("withOwnerSnapshot does not see writes committed after its first query (REPEATABLE READ)", async () => {
    await addIncome(owner, "100.00", "2026-10-05", { today: "2026-10-10" });
    const count = async (tx: Parameters<Parameters<typeof withOwnerSnapshot>[1]>[0]) =>
      (await tx.select().from(incomeEntry).where(eq(incomeEntry.ownerId, owner))).length;

    const [before, after] = await withOwnerSnapshot(owner, async (tx) => {
      const first = await count(tx);
      await addIncome(owner, "50.00", "2026-10-06", { today: "2026-10-10" }); // commits on another connection
      return [first, await count(tx)];
    });
    expect([before, after]).toEqual([1, 1]);
    expect((await getLedger(ctx())).rows).toHaveLength(2);
  });

  it("withOwnerSnapshot still scopes rows to the owner (RLS) and is not read-write-blocking for settings creation", async () => {
    const other = await createTestUser();
    await addIncome(other, "100.00", "2026-10-05", { today: "2026-10-10" });
    // First-ever read for `owner` creates the settings row inside the snapshot transaction.
    const overview = await getOverview(ctx());
    expect(overview.isEmpty).toBe(true);
    const visible = await withOwnerSnapshot(owner, (tx) => tx.select().from(incomeEntry));
    expect(visible).toEqual([]);
  });

  it("retries when the first-use settings row is created concurrently after the snapshot was taken", async () => {
    let attempts = 0;
    const settings = await withOwnerSnapshot(owner, async (tx) => {
      attempts += 1;
      // Another connection creates the owner's settings row after this snapshot began (no-op on the retry).
      await getSettings(ctx());
      return readSettingsRow(tx, owner);
    });
    expect(attempts).toBe(2);
    expect(settings.ownerId).toBe(owner);
  });

  it("backup totals reconcile with the active records it contains", async () => {
    const a = await addIncome(owner, "1,750.00", "2026-10-05", { today: "2026-10-10" });
    await addIncome(owner, "249.99", "2026-10-05", { today: "2026-10-10" });
    await createAdjustment(ctx(), { idempotencyKey: key(), incomeId: a.id, kind: "refund", amount: "250.00", effectiveOn: "2026-10-06", reason: "r" });
    await pay(owner, "50.00", "2026-10-07", { today: "2026-10-10" });
    const p2 = await pay(owner, "10.00", "2026-10-07", { today: "2026-10-10" });
    await reversePayment(ctx(), { idempotencyKey: key(), id: p2.id, reason: "x" });

    const { backup } = await buildBackupExport(ctx());
    const activeIncomes = backup.records.incomes.filter((i) => i.deletedAt === null);
    const activeIds = new Set(activeIncomes.map((i) => i.id));
    const activeAdjustments = backup.records.adjustments.filter((x) => x.deletedAt === null && activeIds.has(x.incomeId));
    const activePayments = backup.records.payments.filter((p) => p.reversedAt === null);
    const netByIncome = activeIncomes.map(
      (i) => i.amountMinor - sumMinor(activeAdjustments.filter((x) => x.incomeId === i.id).map((x) => x.amountMinor)),
    );
    const accrued = netByIncome.reduce((s, net) => s + Math.floor((net * 1000 + 5000) / 10000), 0);
    const paid = sumMinor(activePayments.map((p) => p.amountMinor));
    expect(backup.totals.CAD).toMatchObject({ accruedMinor: accrued, paidMinor: paid, stillToGiveMinor: Math.max(0, accrued - paid) });
    expect(accrued).toBe(17500); // 150.00 + 25.00
  });
});

// ---------------------------------------------------------------------------------------------------------
// Cross-ledger and cross-year edits
// ---------------------------------------------------------------------------------------------------------

describe("edits that move obligations between ledgers or years", () => {
  it("changing an income's currency moves its tithe (and its refunds) to the other ledger; CAD payments become credit", async () => {
    const c = ctx();
    const income = await addIncome(owner, "100.00", "2026-10-05", { today: "2026-10-10" });
    await createAdjustment(c, { idempotencyKey: key(), incomeId: income.id, kind: "refund", amount: "10.00", effectiveOn: "2026-10-06", reason: "r" });
    await pay(owner, "9.00", "2026-10-07", { today: "2026-10-10" });
    expect((await balancesFor(owner)).CAD).toMatchObject({ accruedMinor: 900, paidMinor: 900, stillToGiveMinor: 0, creditMinor: 0 });

    await updateIncome(c, { idempotencyKey: key(), id: income.id, expectedVersion: 1, amount: "100.00", currency: "USD", receivedOn: "2026-10-05" });
    const { CAD, USD } = await balancesFor(owner);
    expect(CAD).toMatchObject({ accruedMinor: 0, paidMinor: 900, stillToGiveMinor: 0, creditMinor: 900 });
    expect(USD).toMatchObject({ accruedMinor: 900, paidMinor: 0, stillToGiveMinor: 900, netIncomeMinor: 9000 });
    // CAD credit is never applied to USD, and a new CAD payment is all credit.
    await expect(pay(owner, "1.00", "2026-10-08", { today: "2026-10-10" })).rejects.toMatchObject({ code: "validation" });
  });

  it("a refund dated in the next year reduces that year's bucket; the paid earlier bucket stays covered and the excess is credit", async () => {
    const at2027 = ctxFor(owner, new Date("2027-01-05T17:00:00Z"));
    const first = await addIncome(owner, "1,000.00", "2026-12-15", { today: "2026-12-20" });
    await pay(owner, "100.00", "2026-12-20");
    await addIncome(owner, "500.00", "2027-01-03", { today: "2027-01-05" });
    await createAdjustment(at2027, { idempotencyKey: key(), incomeId: first.id, kind: "refund", amount: "1,000.00", effectiveOn: "2027-01-04", reason: "Returned" });

    const today = "2027-01-05";
    const { CAD } = await balancesFor(owner, today);
    expect(CAD).toMatchObject({ accruedMinor: 5000, paidMinor: 10000, stillToGiveMinor: 0, creditMinor: 5000 });
    const buckets = await bucketsFor(owner, "CAD", today);
    expect(buckets[2026]).toMatchObject({ accrued: 10000, allocated: 10000, outstanding: 0 });
    expect(buckets[2027]).toMatchObject({ accrued: -5000, outstanding: 0 });

    await expect(pay(owner, "10.00", today)).rejects.toMatchObject({ code: "validation" });
    const credit = await pay(owner, "10.00", today, { confirmCredit: true });
    expect(credit).toMatchObject({ allocations: [], creditMinor: 1000 });
  });
});
