import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";

import { closeDb, getPool } from "@/server/db/client";
import { withOwner } from "@/server/db/with-owner";
import {
  createAdjustment,
  createIncome,
  deleteAdjustment,
  deleteIncome,
  restoreIncome,
  updateIncome,
} from "@/server/services/income";
import { loadActiveSnapshot, loadFullHistory } from "@/server/services/snapshot";

import { createTestUser, resetAppData } from "./helpers/db";
import { ctxFor, expectServiceError, key } from "./helpers/services";

afterAll(closeDb);

let ownerA: string;
let ownerB: string;
let incomeA: string;
let adjustmentA: string;

beforeEach(async () => {
  await resetAppData();
  ownerA = await createTestUser("a@example.test");
  ownerB = await createTestUser("b@example.test");
  incomeA = (await createIncome(ctxFor(ownerA), { idempotencyKey: key(), amount: "1,750.00", currency: "CAD", receivedOn: "2026-10-05", note: "private" })).id;
  adjustmentA = (
    await createAdjustment(ctxFor(ownerA), { idempotencyKey: key(), incomeId: incomeA, kind: "refund", amount: "10.00", effectiveOn: "2026-10-06", reason: "r" })
  ).id;
});

/** Runs raw SQL as the app role in a transaction that is always rolled back. */
async function rawTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

const asOwner = (client: PoolClient, ownerId: string) =>
  client.query("SELECT set_config('app.owner_id', $1, true)", [ownerId]);

describe("cross-account isolation through the services", () => {
  it("owner B cannot update, delete, restore or refund owner A's income", async () => {
    const b = ctxFor(ownerB);
    await expectServiceError(
      updateIncome(b, { idempotencyKey: key(), id: incomeA, expectedVersion: 1, amount: "1", currency: "CAD", receivedOn: "2026-10-05" }),
      "not_found",
    );
    await expectServiceError(deleteIncome(b, { idempotencyKey: key(), id: incomeA }), "not_found");
    await expectServiceError(restoreIncome(b, { idempotencyKey: key(), id: incomeA }), "not_found");
    await expectServiceError(
      createAdjustment(b, { idempotencyKey: key(), incomeId: incomeA, kind: "refund", amount: "1", effectiveOn: "2026-10-06", reason: "x" }),
      "not_found",
    );
    await expectServiceError(deleteAdjustment(b, { idempotencyKey: key(), id: adjustmentA }), "not_found");

    const a = await withOwner(ownerA, (tx) => loadActiveSnapshot(tx, ownerA));
    expect(a.incomes).toHaveLength(1);
    expect(a.incomes[0]).toMatchObject({ amountMinor: 175000, version: 1 });
    expect(a.adjustments).toHaveLength(1);
  });

  it("owner B's snapshot and history exclude owner A's rows", async () => {
    await createIncome(ctxFor(ownerB), { idempotencyKey: key(), amount: "5.00", currency: "USD", receivedOn: "2026-10-05" });
    const snapshot = await withOwner(ownerB, (tx) => loadActiveSnapshot(tx, ownerB));
    expect(snapshot.incomes.map((i) => i.amountMinor)).toEqual([500]);
    expect(snapshot.adjustments).toHaveLength(0);
    const history = await withOwner(ownerB, (tx) => loadFullHistory(tx, ownerB));
    expect(history.records.incomes).toHaveLength(1);
    expect(history.auditEvents).toHaveLength(1);
  });

  it("even a query for owner A's id inside owner B's transaction sees nothing (RLS backstop)", async () => {
    const leaked = await withOwner(ownerB, (tx) => loadActiveSnapshot(tx, ownerA));
    expect(leaked.incomes).toHaveLength(0);
    expect(leaked.adjustments).toHaveLength(0);
  });
});

describe("row-level security with raw SQL as the app role", () => {
  it("without app.owner_id no owner rows are visible", async () => {
    await rawTx(async (c) => {
      for (const table of ["income_entry", "income_adjustment", "audit_event", "app_settings", "idempotency_record"]) {
        const { rows } = await c.query(`SELECT count(*)::int AS n FROM "${table}"`);
        expect(rows[0].n, table).toBe(0);
      }
    });
  });

  it("owner B's setting hides owner A's rows; A's setting shows them", async () => {
    await rawTx(async (c) => {
      await asOwner(c, ownerB);
      expect((await c.query("SELECT id FROM income_entry WHERE id = $1", [incomeA])).rowCount).toBe(0);
      const upd = await c.query("UPDATE income_entry SET note = 'hacked' WHERE id = $1", [incomeA]);
      expect(upd.rowCount).toBe(0);
      const del = await c.query("DELETE FROM income_entry WHERE id = $1", [incomeA]);
      expect(del.rowCount).toBe(0);
    });
    await rawTx(async (c) => {
      await asOwner(c, ownerA);
      const { rows } = await c.query("SELECT note FROM income_entry WHERE id = $1", [incomeA]);
      expect(rows).toEqual([{ note: "private" }]);
    });
  });

  it("rejects INSERT with an owner_id other than app.owner_id", async () => {
    await rawTx(async (c) => {
      await asOwner(c, ownerB);
      await expect(
        c.query(
          `INSERT INTO income_entry (owner_id, currency, amount_minor, received_on, tithe_rate_bps, rounding_policy, tithe_minor)
           VALUES ($1, 'CAD', 100, '2026-10-05', 1000, 'HALF_UP_PER_ENTRY_MINOR', 10)`,
          [ownerA],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("rejects moving a row to another owner via UPDATE", async () => {
    await rawTx(async (c) => {
      await asOwner(c, ownerA);
      await expect(c.query("UPDATE income_entry SET owner_id = $1 WHERE id = $2", [ownerB, incomeA])).rejects.toMatchObject({
        code: "42501",
      });
    });
  });

  it("audit_event is append-only: UPDATE and DELETE affect 0 rows even for the owner", async () => {
    await rawTx(async (c) => {
      await asOwner(c, ownerA);
      const { rows } = await c.query("SELECT count(*)::int AS n FROM audit_event");
      expect(rows[0].n).toBeGreaterThan(0);
      expect((await c.query("UPDATE audit_event SET reason = 'x'")).rowCount).toBe(0);
      expect((await c.query("DELETE FROM audit_event")).rowCount).toBe(0);
      const inserted = await c.query(
        "INSERT INTO audit_event (owner_id, entity_type, entity_id, action) VALUES ($1, 'income', 'x', 'create')",
        [ownerA],
      );
      expect(inserted.rowCount).toBe(1);
    });
  });
});

describe("database constraints", () => {
  const insertIncome = (c: PoolClient, amount: number | string, tithe: number | string, extra = "") =>
    c.query(
      `INSERT INTO income_entry (owner_id, currency, amount_minor, received_on, tithe_rate_bps, rounding_policy, tithe_minor${extra ? ", source" : ""})
       VALUES ($1, 'CAD', $2, '2026-10-05', 1000, 'HALF_UP_PER_ENTRY_MINOR', $3${extra ? ", $4" : ""})`,
      extra ? [ownerA, amount, tithe, extra] : [ownerA, amount, tithe],
    );

  it("accepts a correct tithe and rejects an incorrect one", async () => {
    await rawTx(async (c) => {
      await asOwner(c, ownerA);
      expect((await insertIncome(c, 24999, 2500)).rowCount).toBe(1);
      await expect(insertIncome(c, 24999, 2499)).rejects.toMatchObject({ code: "23514", constraint: "income_entry_tithe_check" });
    });
  });

  it.each([
    [0, 0],
    [-100, -10],
    [100000000000, 10000000000],
  ])("rejects out-of-range amount %d", async (amount, tithe) => {
    await rawTx(async (c) => {
      await asOwner(c, ownerA);
      await expect(insertIncome(c, amount, tithe)).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("rejects unknown currencies, over-long text and refunds linked across owners", async () => {
    await rawTx(async (c) => {
      await asOwner(c, ownerA);
      await expect(
        c.query(
          `INSERT INTO income_entry (owner_id, currency, amount_minor, received_on, tithe_rate_bps, rounding_policy, tithe_minor)
           VALUES ($1, 'EUR', 100, '2026-10-05', 1000, 'HALF_UP_PER_ENTRY_MINOR', 10)`,
          [ownerA],
        ),
      ).rejects.toMatchObject({ code: "23514", constraint: "income_entry_currency_check" });
    });
    await rawTx(async (c) => {
      await asOwner(c, ownerA);
      await expect(insertIncome(c, 100, 10, "x".repeat(121))).rejects.toMatchObject({ code: "23514" });
    });
    // Owner B tries to attach an adjustment to owner A's income: the composite FK (income_id, owner_id) fails.
    await rawTx(async (c) => {
      await asOwner(c, ownerB);
      await expect(
        c.query(
          `INSERT INTO income_adjustment (owner_id, income_id, kind, amount_minor, effective_on, reason)
           VALUES ($1, $2, 'refund', 1, '2026-10-06', 'x')`,
          [ownerB, incomeA],
        ),
      ).rejects.toMatchObject({ code: "23503" });
    });
  });

  it("the deferred trigger rejects allocations that exceed the payment at commit", async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await asOwner(client, ownerA);
      const { rows } = await client.query(
        `INSERT INTO church_payment (owner_id, currency, amount_minor, paid_on, church_name)
         VALUES ($1, 'CAD', 10000, '2026-10-06', 'Grace') RETURNING id`,
        [ownerA],
      );
      const paymentId = rows[0].id as string;
      await client.query(
        `INSERT INTO payment_allocation (owner_id, payment_id, currency, bucket_year, amount_minor)
         VALUES ($1, $2, 'CAD', 2026, 6000), ($1, $2, 'CAD', 2025, 5000)`,
        [ownerA, paymentId],
      );
      // Deferred: the statement succeeds; the check fires at COMMIT.
      await expect(client.query("COMMIT")).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }

    // Within the limit (and a currency mismatch is rejected by the composite FK).
    await rawTx(async (c) => {
      await asOwner(c, ownerA);
      const { rows } = await c.query(
        `INSERT INTO church_payment (owner_id, currency, amount_minor, paid_on, church_name)
         VALUES ($1, 'CAD', 10000, '2026-10-06', 'Grace') RETURNING id`,
        [ownerA],
      );
      const paymentId = rows[0].id as string;
      await c.query(
        `INSERT INTO payment_allocation (owner_id, payment_id, currency, bucket_year, amount_minor)
         VALUES ($1, $2, 'CAD', 2026, 10000)`,
        [ownerA, paymentId],
      );
      await c.query("SET CONSTRAINTS ALL IMMEDIATE");
      await expect(
        c.query(
          `INSERT INTO payment_allocation (owner_id, payment_id, currency, bucket_year, amount_minor)
           VALUES ($1, $2, 'USD', 2025, 1)`,
          [ownerA, paymentId],
        ),
      ).rejects.toMatchObject({ code: "23503" });
    });
  });
});
