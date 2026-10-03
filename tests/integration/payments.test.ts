import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { closeDb } from "@/server/db/client";
import { auditEvent, churchPayment, paymentAllocation } from "@/server/db/schema";
import { withOwner } from "@/server/db/with-owner";
import { getOverview } from "@/server/read-models/overview";
import { pgErrorInfo } from "@/server/services/errors";
import { createAdjustment, deleteIncome, restoreIncome } from "@/server/services/income";
import { createOpening } from "@/server/services/opening";
import { recordPayment, reversePayment, updatePaymentDetails } from "@/server/services/payments";
import { loadFullHistory } from "@/server/services/snapshot";

import { createTestUser, resetAppData } from "./helpers/db";
import { addIncome, balancesFor, bucketsFor, pay } from "./helpers/ledger";
import { ctxFor, expectServiceError, key, noonToronto } from "./helpers/services";

afterAll(closeDb);

let owner: string;
beforeEach(async () => {
  await resetAppData();
  owner = await createTestUser();
});

const countPayments = () =>
  withOwner(owner, async (tx) => (await tx.select().from(churchPayment).where(eq(churchPayment.ownerId, owner))).length);

describe("church payments: partial payments and allocation", () => {
  it("records partial payments against the 2026 bucket", async () => {
    await addIncome(owner, "1,750.00", "2026-10-05");
    await addIncome(owner, "249.99", "2026-10-05");

    const first = await pay(owner, "50.00", "2026-10-08");
    expect(first).toMatchObject({ allocations: [{ bucketYear: 2026, amountMinor: 5000 }], creditMinor: 0 });
    expect((await balancesFor(owner)).CAD).toMatchObject({ accruedMinor: 20000, paidMinor: 5000, stillToGiveMinor: 15000, creditMinor: 0 });

    await pay(owner, "30.00", "2026-10-09");
    const { CAD } = await balancesFor(owner);
    expect(CAD.stillToGiveMinor).toBe(12000);
    expect(await bucketsFor(owner)).toEqual({ 2026: { accrued: 20000, allocated: 8000, creditApplied: 0, outstanding: 12000 } });
  });

  it("allocates oldest bucket first across 2026 and 2027 (clock in 2027)", async () => {
    await addIncome(owner, "1,000.00", "2026-12-15");
    await addIncome(owner, "500.00", "2027-01-03");
    const result = await pay(owner, "120.00", "2027-01-05");
    expect(result).toEqual({
      id: expect.any(String),
      allocations: [
        { bucketYear: 2026, amountMinor: 10000 },
        { bucketYear: 2027, amountMinor: 2000 },
      ],
      creditMinor: 0,
    });
    const buckets = await bucketsFor(owner, "CAD", "2027-01-05");
    expect(buckets[2026]).toMatchObject({ allocated: 10000, outstanding: 0 });
    expect(buckets[2027]).toMatchObject({ allocated: 2000, outstanding: 3000 });
    expect((await balancesFor(owner, "2027-01-05")).CAD.stillToGiveMinor).toBe(3000);
  });

  it("accepts an explicit split and validates it against current outstanding amounts", async () => {
    await addIncome(owner, "1,000.00", "2026-12-15");
    await addIncome(owner, "500.00", "2027-01-03");
    const today = "2027-01-05";

    await expectServiceError(
      pay(owner, "200.00", today, { allocations: [{ bucketYear: 2026, amount: "100.01" }] }),
      "validation",
      "allocations.0.amount",
    );
    await expectServiceError(
      pay(owner, "10.00", today, { allocations: [{ bucketYear: 2025, amount: "5.00" }] }),
      "validation",
      "allocations.0.amount",
    );
    await expectServiceError(
      pay(owner, "10.00", today, {
        allocations: [
          { bucketYear: 2026, amount: "8.00" },
          { bucketYear: 2027, amount: "8.00" },
        ],
      }),
      "validation",
      "allocations",
    );
    // Duplicate years are rejected by the shared schema.
    await expectServiceError(
      pay(owner, "10.00", today, {
        allocations: [
          { bucketYear: 2026, amount: "1.00" },
          { bucketYear: 2026, amount: "1.00" },
        ],
      }),
      "validation",
      "allocations.1.bucketYear",
    );
    expect(await countPayments()).toBe(0);

    // Paying the newer year first is allowed when chosen explicitly.
    const result = await pay(owner, "50.00", today, { allocations: [{ bucketYear: 2027, amount: "50.00" }] });
    expect(result.allocations).toEqual([{ bucketYear: 2027, amountMinor: 5000 }]);
    const buckets = await bucketsFor(owner, "CAD", today);
    expect(buckets[2026]).toMatchObject({ outstanding: 10000 });
    expect(buckets[2027]).toMatchObject({ outstanding: 0 });
  });

  it("rejects a future paid date and an unconfirmed payment", async () => {
    await addIncome(owner, "100.00", "2026-10-05");
    await expectServiceError(pay(owner, "5.00", "2026-10-11", { today: "2026-10-10" }), "validation", "paidOn");
    await expectServiceError(pay(owner, "5.00", "2026-10-10", { confirmMadePayment: false }), "validation", "confirmMadePayment");
    await expectServiceError(pay(owner, "0.00", "2026-10-10"), "validation", "amount");
    expect(await countPayments()).toBe(0);
  });

  it("audits the payment with its allocations", async () => {
    await addIncome(owner, "100.00", "2026-10-05");
    const { id } = await pay(owner, "10.00", "2026-10-06");
    const events = await withOwner(owner, (tx) =>
      tx.select().from(auditEvent).where(and(eq(auditEvent.ownerId, owner), eq(auditEvent.entityId, id))),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ entityType: "payment", action: "create" });
    expect(events[0]!.after).toMatchObject({ amountMinor: 1000, allocations: [{ bucketYear: 2026, amountMinor: 1000 }] });
  });
});

describe("carry-over after December 31", () => {
  it("keeps the unpaid 2026 balance due and visible in 2027; nothing resets", async () => {
    await addIncome(owner, "1,000.00", "2026-11-01");
    await pay(owner, "40.00", "2026-11-05");

    const ctx2027 = ctxFor(owner, noonToronto("2027-01-05"));
    const overview = await getOverview(ctx2027);
    expect(overview.today).toBe("2027-01-05");
    expect(overview.period.key).toBe(2027);
    const cad = overview.headlines.find((h) => h.currency === "CAD")!;
    expect(cad).toMatchObject({ stillToGiveMinor: 6000, carriedOverMinor: 6000, accruedMinor: 10000, paidMinor: 4000 });
    expect(overview.buckets.map((b) => [b.year, b.outstandingMinor])).toEqual([[2026, 6000]]);
    expect(overview.periodOptions.map((o) => o.key)).toEqual(["2027", "2026", "all"]);
    expect(overview.periodSummary).toMatchObject({ accruedMinor: 0, outstandingMinor: 0, entryCount: 0 });

    const view2026 = await getOverview(ctx2027, { period: "2026" });
    expect(view2026.periodSummary).toMatchObject({ accruedMinor: 10000, givenMinor: 4000, outstandingMinor: 6000, entryCount: 1 });
    expect(view2026.period).toMatchObject({ start: "2026-10-03", end: "2026-12-31" });

    // The default payout date (Dec 31, 2026) has passed with money still owed: overdue, not reset.
    expect(overview.payout).toMatchObject({ phase: "overdue", plannedDate: "2026-12-31", daysOverdue: 5 });
    expect(overview.payout.perCurrency.find((p) => p.currency === "CAD")).toMatchObject({ dueMinor: 6000, overdueMinor: 6000 });
  });
});

describe("credit", () => {
  it("requires confirmCredit for an overpayment, keeps it as credit, then applies it to 2027", async () => {
    await addIncome(owner, "100.00", "2026-10-05");
    const error = await expectServiceError(pay(owner, "25.00", "2026-10-06"), "validation", "confirmCredit");
    expect(error.fieldErrors?.confirmCredit).toContain("CAD 15.00");
    expect(await countPayments()).toBe(0);

    const result = await pay(owner, "25.00", "2026-10-06", { confirmCredit: true });
    expect(result).toMatchObject({ allocations: [{ bucketYear: 2026, amountMinor: 1000 }], creditMinor: 1500 });
    expect((await balancesFor(owner)).CAD).toMatchObject({ stillToGiveMinor: 0, creditMinor: 1500, unallocatedMinor: 1500 });

    await addIncome(owner, "200.00", "2027-01-02");
    const { CAD } = await balancesFor(owner, "2027-01-05");
    expect(CAD).toMatchObject({ accruedMinor: 3000, paidMinor: 2500, stillToGiveMinor: 500, creditMinor: 0 });
    expect((await bucketsFor(owner, "CAD", "2027-01-05"))[2027]).toEqual({
      accrued: 2000,
      allocated: 0,
      creditApplied: 1500,
      outstanding: 500,
    });
  });

  it("a payment with nothing owed is all credit (explicit empty split too)", async () => {
    const auto = await pay(owner, "10.00", "2026-10-06", { confirmCredit: true });
    expect(auto).toMatchObject({ allocations: [], creditMinor: 1000 });
    const explicit = await pay(owner, "5.00", "2026-10-06", { confirmCredit: true, allocations: [] });
    expect(explicit).toMatchObject({ allocations: [], creditMinor: 500 });
    expect((await balancesFor(owner)).CAD).toMatchObject({ creditMinor: 1500, stillToGiveMinor: 0 });
  });

  it("a refund after payment produces credit", async () => {
    const income = await addIncome(owner, "1,000.00", "2026-10-05");
    await pay(owner, "100.00", "2026-10-06");
    await createAdjustment(ctxFor(owner), {
      idempotencyKey: key(),
      incomeId: income.id,
      kind: "refund",
      amount: "500.00",
      effectiveOn: "2026-10-07",
      reason: "Returned half",
    });
    expect((await balancesFor(owner)).CAD).toMatchObject({ accruedMinor: 5000, paidMinor: 10000, stillToGiveMinor: 0, creditMinor: 5000 });
    expect((await bucketsFor(owner))[2026]).toMatchObject({ allocated: 10000, outstanding: 0 });
  });

  it("deleting income after payment produces credit; restoring removes it", async () => {
    const income = await addIncome(owner, "1,000.00", "2026-10-05");
    await pay(owner, "100.00", "2026-10-06");
    await deleteIncome(ctxFor(owner), { idempotencyKey: key(), id: income.id });
    expect((await balancesFor(owner)).CAD).toMatchObject({ accruedMinor: 0, stillToGiveMinor: 0, creditMinor: 10000 });
    await restoreIncome(ctxFor(owner), { idempotencyKey: key(), id: income.id });
    expect((await balancesFor(owner)).CAD).toMatchObject({ accruedMinor: 10000, stillToGiveMinor: 0, creditMinor: 0 });
  });
});

describe("opening obligations", () => {
  it("count as obligations (oldest bucket first) but never as income", async () => {
    await createOpening(ctxFor(owner), {
      idempotencyKey: key(),
      amount: "300.00",
      currency: "CAD",
      effectiveOn: "2025-06-01",
    });
    await addIncome(owner, "100.00", "2026-10-05");
    const { CAD } = await balancesFor(owner);
    expect(CAD).toMatchObject({ grossIncomeMinor: 10000, netIncomeMinor: 10000, openingMinor: 30000, accruedMinor: 31000 });

    const result = await pay(owner, "305.00", "2026-10-06");
    expect(result.allocations).toEqual([
      { bucketYear: 2025, amountMinor: 30000 },
      { bucketYear: 2026, amountMinor: 500 },
    ]);
    const overview = await getOverview(ctxFor(owner), { period: "2025" });
    expect(overview.period.key).toBe(2025);
    expect(overview.periodSummary).toMatchObject({ grossIncomeMinor: 0, openingMinor: 30000, givenMinor: 30000, outstandingMinor: 0 });
  });
});

describe("reversal and details", () => {
  it("reversing a payment restores the balance, is idempotent and keeps the history", async () => {
    await addIncome(owner, "1,000.00", "2026-10-05");
    const { id } = await pay(owner, "60.00", "2026-10-06");
    expect((await balancesFor(owner)).CAD.stillToGiveMinor).toBe(4000);

    await expectServiceError(reversePayment(ctxFor(owner), { idempotencyKey: key(), id, reason: "  " }), "validation", "reason");
    await reversePayment(ctxFor(owner), { idempotencyKey: key(), id, reason: "Entered twice" });
    expect((await balancesFor(owner)).CAD).toMatchObject({ stillToGiveMinor: 10000, paidMinor: 0 });
    expect(await reversePayment(ctxFor(owner), { idempotencyKey: key(), id, reason: "Again" })).toEqual({ id });

    const history = await withOwner(owner, (tx) => loadFullHistory(tx, owner));
    expect(history.records.payments).toHaveLength(1);
    expect(history.records.payments[0]).toMatchObject({ reversalReason: "Entered twice", version: 2 });
    expect(history.records.payments[0]!.reversedAt).not.toBeNull();
    expect(history.auditEvents.filter((e) => e.action === "reverse")).toHaveLength(1);

    await expectServiceError(
      updatePaymentDetails(ctxFor(owner), { idempotencyKey: key(), id, expectedVersion: 2, churchName: "Other" }),
      "conflict",
    );
  });

  it("edits church name, reference and note with optimistic concurrency", async () => {
    await addIncome(owner, "100.00", "2026-10-05");
    const { id } = await pay(owner, "10.00", "2026-10-06", { reference: "chq 1" });
    const edit = { id, churchName: "St. Mark", reference: "chq 2", note: "Thanks" };
    await updatePaymentDetails(ctxFor(owner), { idempotencyKey: key(), expectedVersion: 1, ...edit });
    // Identical edit from a stale form: no-op success.
    await updatePaymentDetails(ctxFor(owner), { idempotencyKey: key(), expectedVersion: 1, ...edit });
    await expectServiceError(
      updatePaymentDetails(ctxFor(owner), { idempotencyKey: key(), expectedVersion: 1, ...edit, note: "changed" }),
      "stale",
    );
    const [row] = await withOwner(owner, (tx) => tx.select().from(churchPayment).where(eq(churchPayment.ownerId, owner)));
    expect(row).toMatchObject({ churchName: "St. Mark", reference: "chq 2", note: "Thanks", version: 2, amountMinor: 1000 });
  });

  it("unknown payment ids are not found", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    await expectServiceError(reversePayment(ctxFor(owner), { idempotencyKey: key(), id, reason: "x" }), "not_found");
    await expectServiceError(
      updatePaymentDetails(ctxFor(owner), { idempotencyKey: key(), id, expectedVersion: 1, churchName: "x" }),
      "not_found",
    );
  });
});

describe("database guards and idempotency", () => {
  it("the deferred trigger rejects allocations exceeding the payment at commit", async () => {
    await addIncome(owner, "1,000.00", "2026-10-05");
    const { id } = await pay(owner, "50.00", "2026-10-06");

    let caught: unknown;
    try {
      await withOwner(owner, async (tx) => {
        await tx.insert(paymentAllocation).values({ ownerId: owner, paymentId: id, currency: "CAD", bucketYear: 2027, amountMinor: 1 });
      });
    } catch (err) {
      caught = err;
    }
    expect(pgErrorInfo(caught)?.code).toBe("23514");

    caught = undefined;
    try {
      await withOwner(owner, async (tx) => {
        await tx.update(churchPayment).set({ amountMinor: 4999 }).where(and(eq(churchPayment.ownerId, owner), eq(churchPayment.id, id)));
      });
    } catch (err) {
      caught = err;
    }
    expect(pgErrorInfo(caught)?.code).toBe("23514");

    const rows = await withOwner(owner, (tx) => tx.select().from(paymentAllocation).where(eq(paymentAllocation.ownerId, owner)));
    expect(rows.map((r) => [r.bucketYear, r.amountMinor])).toEqual([[2026, 5000]]);
  });

  it("a double-submitted payment is recorded once", async () => {
    await addIncome(owner, "1,000.00", "2026-10-05");
    const input = {
      idempotencyKey: key(),
      amount: "40.00",
      currency: "CAD" as const,
      paidOn: "2026-10-06",
      churchName: "Grace",
      allocations: "auto" as const,
      confirmCredit: false,
      confirmMadePayment: true,
      drawFromSetAside: false,
    };
    const ctx = ctxFor(owner, noonToronto("2026-10-06"));
    const results = await Promise.all(Array.from({ length: 5 }, () => recordPayment(ctx, input)));
    for (const r of results) expect(r).toEqual(results[0]);
    expect(await recordPayment(ctx, input)).toEqual(results[0]);
    expect(await countPayments()).toBe(1);
    expect((await balancesFor(owner)).CAD.paidMinor).toBe(4000);

    await expectServiceError(recordPayment(ctx, { ...input, amount: "41.00" }), "idempotency_conflict");
  });
});
