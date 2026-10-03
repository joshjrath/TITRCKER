import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { LEDGER_CSV_HEADER, sumMinor } from "@/domain";
import { closeDb } from "@/server/db/client";
import { withOwner } from "@/server/db/with-owner";
import { buildBackupExport, buildCsvExport } from "@/server/read-models/export";
import { getGiven } from "@/server/read-models/given";
import { getLedger } from "@/server/read-models/ledger";
import { getOverview } from "@/server/read-models/overview";
import { createAdjustment, createIncome, deleteIncome } from "@/server/services/income";
import { createOpening } from "@/server/services/opening";
import { recordPayment, reversePayment } from "@/server/services/payments";
import { createSetAside } from "@/server/services/set-aside";

import { createTestUser, resetAppData } from "./helpers/db";
import { addIncome, pay } from "./helpers/ledger";
import { ctxFor, key, noonToronto } from "./helpers/services";

afterAll(closeDb);

let owner: string;
beforeEach(async () => {
  await resetAppData();
  owner = await createTestUser("reader@example.test");
});

const at = (date: string) => ctxFor(owner, noonToronto(date));

describe("overview: periods and currency", () => {
  beforeEach(async () => {
    await addIncome(owner, "1,000.00", "2026-10-05");
    await addIncome(owner, "500.00", "2026-11-01");
    await addIncome(owner, "200.00", "2027-01-03");
    await pay(owner, "120.00", "2027-01-04");
  });

  it("summarizes 2026, 2027 and all time separately", async () => {
    const ctx = at("2027-01-05");
    const y2027 = await getOverview(ctx);
    expect(y2027.period).toMatchObject({ key: 2027, start: "2027-01-01", end: "2027-12-31" });
    expect(y2027.periodSummary).toMatchObject({ grossIncomeMinor: 20000, accruedMinor: 2000, givenMinor: 0, outstandingMinor: 2000, entryCount: 1 });
    expect(y2027.periodProgress).toMatchObject({ start: "2027-01-01", end: "2027-12-31", today: "2027-01-05" });
    expect(y2027.periodProgress.fraction).toBeCloseTo(4 / 364, 10);

    const y2026 = await getOverview(ctx, { period: "2026" });
    expect(y2026.period).toMatchObject({ key: 2026, start: "2026-10-03", end: "2026-12-31", label: "Oct 3 – Dec 31, 2026" });
    expect(y2026.periodSummary).toMatchObject({ grossIncomeMinor: 150000, accruedMinor: 15000, givenMinor: 12000, outstandingMinor: 3000, entryCount: 2 });
    expect(y2026.periodProgress.fraction).toBe(1);
    expect(y2026.chart.endValueMinor).toBe(15000);
    expect(y2026.monthly.map((m) => [m.monthKey, m.titheMinor])).toEqual([
      ["2026-10", 10000],
      ["2026-11", 5000],
      ["2026-12", 0],
    ]);

    const all = await getOverview(ctx, { period: "all" });
    expect(all.period).toMatchObject({ key: "all", start: "2026-10-03", label: "All time" });
    expect(all.periodSummary).toMatchObject({ grossIncomeMinor: 170000, accruedMinor: 17000, givenMinor: 12000, outstandingMinor: 5000, entryCount: 3 });

    const cad = all.headlines.find((h) => h.currency === "CAD")!;
    expect(cad).toMatchObject({ stillToGiveMinor: 5000, carriedOverMinor: 3000, accruedMinor: 17000, paidMinor: 12000, hasActivity: true });
    expect(all.headlines.find((h) => h.currency === "USD")).toMatchObject({ hasActivity: false, stillToGiveMinor: 0 });
    expect(all.recent.map((r) => r.receivedOn)).toEqual(["2027-01-03", "2026-11-01", "2026-10-05"]);
    expect(all.isEmpty).toBe(false);
  });

  it("validates the period and currency parameters", async () => {
    const ctx = at("2027-01-05");
    for (const bad of ["2031", "2025", "abc", "", null, "2026-01"]) {
      expect((await getOverview(ctx, { period: bad })).period.key).toBe(2027);
    }
    expect((await getOverview(ctx, { period: " ALL " })).period.key).toBe("all");
    expect((await getOverview(ctx, { currency: "usd" })).currency).toBe("USD");
    expect((await getOverview(ctx, { currency: "EUR" })).currency).toBe("CAD");
    expect((await getOverview(ctx, { currency: "USD" })).buckets).toEqual([]);
  });
});

describe("overview: empty account", () => {
  it("is empty with the default first period", async () => {
    const vm = await getOverview(at("2026-10-03"));
    expect(vm.isEmpty).toBe(true);
    expect(vm.period).toMatchObject({ key: 2026, start: "2026-10-03", end: "2026-12-31" });
    expect(vm.periodOptions).toEqual([
      { key: "2026", label: "2026" },
      { key: "all", label: "All time" },
    ]);
    expect(vm.periodProgress.fraction).toBe(0);
    expect(vm.payout).toMatchObject({ phase: "upcoming", daysUntil: 89, label: "89 days until payout" });
    expect(vm.recent).toEqual([]);
  });
});

describe("payout status through the read model", () => {
  beforeEach(async () => {
    await addIncome(owner, "100.00", "2026-10-05");
  });

  it("Dec 30: 1 day until payout", async () => {
    const vm = await getOverview(at("2026-12-30"));
    expect(vm.payout).toMatchObject({ phase: "upcoming", daysUntil: 1, label: "1 day until payout", isDefaultDate: true });
    expect(vm.payout.perCurrency.find((p) => p.currency === "CAD")).toMatchObject({ dueMinor: 1000, overdueMinor: 0 });
  });

  it("Dec 31: Due today", async () => {
    const vm = await getOverview(at("2026-12-31"));
    expect(vm.payout).toMatchObject({ phase: "due_today", label: "Due today", daysUntil: null, targetDate: "2026-12-31" });
  });

  it("Jan 2: overdue (only obligations dated on/before the payout date)", async () => {
    await addIncome(owner, "300.00", "2027-01-01");
    const vm = await getOverview(at("2027-01-02"));
    expect(vm.payout).toMatchObject({ phase: "overdue", daysOverdue: 2, label: "Overdue by 2 days" });
    expect(vm.payout.perCurrency.find((p) => p.currency === "CAD")).toMatchObject({ dueMinor: 4000, overdueMinor: 1000 });

    // Once the overdue part is paid, the payout rolls to Dec 31 of the current year.
    await pay(owner, "10.00", "2027-01-02");
    const settled = await getGiven(at("2027-01-02"));
    expect(settled.payout).toMatchObject({ phase: "settled_rolled", targetDate: "2027-12-31", isDefaultDate: true });
  });
});

describe("ledger and given read models", () => {
  it("lists active income with refunds and payments newest first (reversed flagged)", async () => {
    const income = await addIncome(owner, "1,000.00", "2026-10-05", { today: "2026-10-10" });
    await createAdjustment(at("2026-10-10"), {
      idempotencyKey: key(),
      incomeId: income.id,
      kind: "refund",
      amount: "249.99",
      effectiveOn: "2026-10-06",
      reason: "Partial return",
    });
    const deleted = await addIncome(owner, "5.00", "2026-10-07", { today: "2026-10-10", currency: "USD" });
    await deleteIncome(at("2026-10-10"), { idempotencyKey: key(), id: deleted.id });

    const ledger = await getLedger(at("2026-10-10"));
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({
      amountMinor: 100000,
      refundedMinor: 24999,
      netAmountMinor: 75001,
      titheMinor: 10000,
      netTitheMinor: 7500,
      refundableMinor: 75001,
    });
    expect(ledger.rows[0]!.adjustments).toEqual([
      expect.objectContaining({ kind: "refund", amountMinor: 24999, titheDeltaMinor: -2500, reason: "Partial return" }),
    ]);

    const p1 = await pay(owner, "10.00", "2026-10-08", { today: "2026-10-10" });
    const p2 = await pay(owner, "20.00", "2026-10-09", { today: "2026-10-10" });
    await reversePayment(at("2026-10-10"), { idempotencyKey: key(), id: p1.id, reason: "Duplicate" });
    const given = await getGiven(at("2026-10-10"), { currency: "usd" });
    expect(given.currency).toBe("USD");
    expect(given.payments.map((p) => [p.id, p.reversedAt === null])).toEqual([
      [p2.id, true],
      [p1.id, false],
    ]);
    expect(given.payments[0]).toMatchObject({ allocations: [{ bucketYear: 2026, amountMinor: 2000 }], unallocatedMinor: 0 });
    expect(given.bucketsByCurrency.CAD.map((b) => [b.year, b.outstandingMinor])).toEqual([[2026, 5500]]);
    expect(given.bucketsByCurrency.USD).toEqual([]);
  });
});

describe("export builders", () => {
  it("CSV: BOM, header, records and reconciling summary rows", async () => {
    await addIncome(owner, "1,750.00", "2026-10-05", { today: "2026-10-10" });
    await addIncome(owner, "249.99", "2026-10-05", { today: "2026-10-10" });
    await pay(owner, "50.00", "2026-10-06", { today: "2026-10-10", note: "=HYPERLINK(\"x\")" });
    const { filename, body } = await buildCsvExport(at("2026-10-10"));
    expect(filename).toBe("tenth-ledger-2026-10-10.csv");
    expect(body.startsWith("﻿")).toBe(true);
    const lines = body.slice(1).split("\r\n");
    expect(lines[0]).toBe(LEDGER_CSV_HEADER.join(","));
    expect(body).toContain("'=HYPERLINK");
    const summary = (type: string) => {
      const line = lines.find((l) => l.startsWith(`${type},`));
      return line?.split(",")[LEDGER_CSV_HEADER.indexOf("amount_minor")];
    };
    expect(summary("summary_accrued")).toBe("20000");
    expect(summary("summary_paid")).toBe("5000");
    expect(summary("summary_still_to_give")).toBe("15000");
  });

  it("JSON backup: full history incl. deleted and reversed records plus audit events", async () => {
    const kept = await addIncome(owner, "100.00", "2026-10-05", { today: "2026-10-10" });
    const gone = await addIncome(owner, "50.00", "2026-10-06", { today: "2026-10-10" });
    await deleteIncome(at("2026-10-10"), { idempotencyKey: key(), id: gone.id, reason: "Mistake" });
    const p = await pay(owner, "5.00", "2026-10-07", { today: "2026-10-10" });
    await reversePayment(at("2026-10-10"), { idempotencyKey: key(), id: p.id, reason: "Undo" });

    const { filename, backup } = await buildBackupExport(at("2026-10-10"));
    expect(filename).toBe("tenth-backup-2026-10-10.json");
    expect(backup).toMatchObject({ format: "tenth-backup", version: 1, account: { email: "reader@example.test" } });
    expect(backup.settings).toMatchObject({ trackingStart: "2026-10-03", timeZone: "America/Toronto", churchName: null });
    expect(backup.records.incomes.map((i) => [i.id, i.deletedReason])).toEqual([
      [kept.id, null],
      [gone.id, "Mistake"],
    ]);
    expect(backup.records.payments[0]).toMatchObject({ id: p.id, reversalReason: "Undo" });
    expect(backup.totals.CAD).toMatchObject({ accruedMinor: 1000, paidMinor: 0, stillToGiveMinor: 1000 });
    expect(backup.auditEvents.map((e) => e.action).sort()).toEqual(["create", "create", "create", "delete", "reverse"]);
    // Round-trips as JSON.
    expect(JSON.parse(JSON.stringify(backup))).toEqual(backup);
  });
});

/** Deterministic pseudo-random numbers (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(epochDay: number): string {
  return new Date(epochDay * 86_400_000).toISOString().slice(0, 10);
}
const dayOf = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const money = (minor: number) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;

describe("reconciliation: read-model totals vs independent SQL aggregates", () => {
  it.each([1, 7, 42])("randomized ledger (seed %i)", async (seed) => {
    const rand = rng(seed);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
    const ctx = at("2027-04-01");
    const first = dayOf("2026-10-03");
    const last = dayOf("2027-03-31");
    const randomDate = (from = first) => isoDate(from + Math.floor(rand() * (last - from + 1)));
    const incomes: { id: string; amount: number; date: string }[] = [];
    const payments: string[] = [];
    let refunds = 0;

    for (let i = 0; i < 45; i += 1) {
      const roll = rand();
      const currency = pick(["CAD", "CAD", "USD"] as const);
      if (roll < 0.5 || incomes.length === 0) {
        const amount = 1 + Math.floor(rand() * 500_000);
        const date = randomDate();
        const r = await createIncome(ctx, { idempotencyKey: key(), amount: money(amount), currency, receivedOn: date });
        incomes.push({ id: r.id, amount, date });
      } else if (roll < 0.65) {
        const target = pick(incomes);
        const amount = 1 + Math.floor(rand() * Math.max(1, Math.floor(target.amount / 3)));
        await createAdjustment(ctx, {
          idempotencyKey: key(),
          incomeId: target.id,
          kind: "refund",
          amount: money(amount),
          effectiveOn: randomDate(dayOf(target.date)),
          reason: "random",
        })
          .then(() => (refunds += 1))
          .catch(() => undefined); // over-limit / deleted targets are fine to skip
      } else if (roll < 0.85) {
        const r = await recordPayment(ctx, {
          idempotencyKey: key(),
          amount: money(1 + Math.floor(rand() * 40_000)),
          currency,
          paidOn: randomDate(),
          churchName: "Grace",
          allocations: "auto",
          confirmCredit: true,
          confirmMadePayment: true,
          drawFromSetAside: rand() < 0.3,
        });
        payments.push(r.id);
      } else if (roll < 0.9) {
        await createOpening(ctx, { idempotencyKey: key(), amount: money(1 + Math.floor(rand() * 10_000)), currency, effectiveOn: pick(["2025-05-01", "2026-12-01"]) });
      } else if (roll < 0.95) {
        await createSetAside(ctx, { idempotencyKey: key(), kind: "reserve", amount: money(1 + Math.floor(rand() * 20_000)), currency, effectiveOn: randomDate() });
      } else if (payments.length > 0 && rand() < 0.5) {
        await reversePayment(ctx, { idempotencyKey: key(), id: pick(payments), reason: "random" });
      } else {
        await deleteIncome(ctx, { idempotencyKey: key(), id: pick(incomes).id });
      }
    }

    expect(refunds).toBeGreaterThan(0);
    expect(payments.length).toBeGreaterThan(0);

    const sqlTotals = await withOwner(owner, async (tx) => {
      const result = await tx.execute<{ currency: string; accrued: string; paid: string; net_income: string; set_aside: string }>(sql`
        WITH inc AS (
          SELECT i.currency, i.amount_minor,
                 (i.amount_minor - COALESCE((SELECT SUM(a.amount_minor) FROM income_adjustment a
                     WHERE a.owner_id = i.owner_id AND a.income_id = i.id AND a.deleted_at IS NULL), 0))::bigint AS net
          FROM income_entry i WHERE i.owner_id = ${owner} AND i.deleted_at IS NULL
        ), cur AS (SELECT unnest(ARRAY['CAD','USD']) AS currency)
        SELECT cur.currency,
          COALESCE((SELECT SUM((net * 1000 + 5000) / 10000) FROM inc WHERE inc.currency = cur.currency), 0)
            + COALESCE((SELECT SUM(amount_minor) FROM opening_obligation o
                WHERE o.owner_id = ${owner} AND o.deleted_at IS NULL AND o.currency = cur.currency), 0) AS accrued,
          COALESCE((SELECT SUM(amount_minor) FROM church_payment p
                WHERE p.owner_id = ${owner} AND p.reversed_at IS NULL AND p.currency = cur.currency), 0) AS paid,
          COALESCE((SELECT SUM(net) FROM inc WHERE inc.currency = cur.currency), 0) AS net_income,
          COALESCE((SELECT SUM(CASE WHEN kind = 'reserve' THEN amount_minor ELSE -amount_minor END) FROM set_aside_entry s
                WHERE s.owner_id = ${owner} AND s.deleted_at IS NULL AND s.currency = cur.currency), 0) AS set_aside
        FROM cur ORDER BY cur.currency`);
      return result.rows;
    });

    const overview = await getOverview(ctx, { period: "all" });
    const { body } = await buildCsvExport(ctx);
    const csvLines = body.slice(1).split("\r\n");
    const csvSummary = (type: string, currency: string) =>
      csvLines
        .map((l) => l.split(","))
        .find((cells) => cells[0] === type && cells[LEDGER_CSV_HEADER.indexOf("currency")] === currency)?.[
        LEDGER_CSV_HEADER.indexOf("amount_minor")
      ];

    for (const row of sqlTotals) {
      const accrued = Number(row.accrued);
      const paid = Number(row.paid);
      const headline = overview.headlines.find((h) => h.currency === row.currency)!;
      expect(headline.accruedMinor, `${row.currency} accrued`).toBe(accrued);
      expect(headline.paidMinor, `${row.currency} paid`).toBe(paid);
      expect(headline.netIncomeMinor, `${row.currency} net income`).toBe(Number(row.net_income));
      expect(headline.setAsideMinor, `${row.currency} set aside`).toBe(Number(row.set_aside));
      expect(headline.setAsideMinor).toBeGreaterThanOrEqual(0);
      expect(headline.stillToGiveMinor).toBe(Math.max(0, accrued - paid));
      expect(headline.creditMinor).toBe(Math.max(0, paid - accrued));

      const given = await getGiven(ctx);
      const outstanding = sumMinor(given.bucketsByCurrency[row.currency as "CAD" | "USD"].map((b) => b.outstandingMinor));
      expect(outstanding).toBe(headline.stillToGiveMinor);
      if (headline.hasActivity) {
        expect(csvSummary("summary_accrued", row.currency)).toBe(String(accrued));
        expect(csvSummary("summary_paid", row.currency)).toBe(String(paid));
      }
    }
  });
});
