import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb } from "@/server/db/client";
import { auditEvent, idempotencyRecord, incomeAdjustment, incomeEntry } from "@/server/db/schema";
import { withOwner } from "@/server/db/with-owner";
import { canonicalJson, requestHash, withIdempotency } from "@/server/services/idempotency";
import { createAdjustment, createIncome, deleteIncome } from "@/server/services/income";

import { createTestUser, resetAppData } from "./helpers/db";
import { ctxFor, expectServiceError, key } from "./helpers/services";

afterAll(closeDb);

let owner: string;
beforeEach(async () => {
  await resetAppData();
  owner = await createTestUser();
});

const countIncome = () =>
  withOwner(owner, async (tx) => (await tx.select().from(incomeEntry).where(eq(incomeEntry.ownerId, owner))).length);

describe("idempotency", () => {
  it("canonical JSON ignores key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
  });

  it("a sequential retry with the same key returns the stored response and writes one row", async () => {
    const input = { idempotencyKey: key(), amount: "1,750.00", currency: "CAD" as const, receivedOn: "2026-10-05" };
    const first = await createIncome(ctxFor(owner), input);
    const second = await createIncome(ctxFor(owner), input);
    expect(second).toEqual(first);
    expect(await countIncome()).toBe(1);
    const audits = await withOwner(owner, (tx) => tx.select().from(auditEvent).where(eq(auditEvent.ownerId, owner)));
    expect(audits).toHaveLength(1);
  });

  it("equivalent payloads (whitespace, $ prefix) count as the same request", async () => {
    const k = key();
    const first = await createIncome(ctxFor(owner), { idempotencyKey: k, amount: "1750", currency: "CAD", receivedOn: "2026-10-05", source: "Pay" });
    const second = await createIncome(ctxFor(owner), { idempotencyKey: k, amount: " $1,750.00 ", currency: "CAD", receivedOn: "2026-10-05", source: " Pay " });
    expect(second).toEqual(first);
    expect(await countIncome()).toBe(1);
  });

  it("concurrent duplicates (double submit) create exactly one row", async () => {
    const input = { idempotencyKey: key(), amount: "249.99", currency: "CAD" as const, receivedOn: "2026-10-05" };
    const results = await Promise.all(Array.from({ length: 5 }, () => createIncome(ctxFor(owner), input)));
    for (const r of results) expect(r).toEqual(results[0]);
    expect(await countIncome()).toBe(1);
    const records = await withOwner(owner, (tx) =>
      tx.select().from(idempotencyRecord).where(eq(idempotencyRecord.ownerId, owner)),
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ operation: "income.create" });
    expect(records[0]!.response).toEqual({ v: 1, value: results[0] });
  });

  it("concurrent refunds with distinct keys respect the refund limit (serialized by the settings lock)", async () => {
    const { id } = await createIncome(ctxFor(owner), { idempotencyKey: key(), amount: "100.00", currency: "CAD", receivedOn: "2026-10-05" });
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        createAdjustment(ctxFor(owner), { idempotencyKey: key(), incomeId: id, kind: "refund", amount: "40.00", effectiveOn: "2026-10-06", reason: "r" }),
      ),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(2);
    const rows = await withOwner(owner, (tx) =>
      tx.select().from(incomeAdjustment).where(eq(incomeAdjustment.ownerId, owner)),
    );
    expect(rows.reduce((s, r) => s + r.amountMinor, 0)).toBe(8000);
  });

  it("the same key with a different payload is an idempotency_conflict", async () => {
    const k = key();
    await createIncome(ctxFor(owner), { idempotencyKey: k, amount: "10.00", currency: "CAD", receivedOn: "2026-10-05" });
    await expectServiceError(
      createIncome(ctxFor(owner), { idempotencyKey: k, amount: "10.01", currency: "CAD", receivedOn: "2026-10-05" }),
      "idempotency_conflict",
    );
    expect(await countIncome()).toBe(1);
  });

  it("the same key reused for a different operation is an idempotency_conflict", async () => {
    const k = key();
    const { id } = await createIncome(ctxFor(owner), { idempotencyKey: k, amount: "10.00", currency: "CAD", receivedOn: "2026-10-05" });
    await expectServiceError(deleteIncome(ctxFor(owner), { idempotencyKey: k, id }), "idempotency_conflict");
  });

  it("a failed request does not burn its key", async () => {
    const k = key();
    await expectServiceError(
      createIncome(ctxFor(owner), { idempotencyKey: k, amount: "10.00", currency: "CAD", receivedOn: "2026-10-30" }),
      "validation",
    );
    // Same key, corrected payload: allowed because the failed attempt rolled back.
    const ok = await createIncome(ctxFor(owner), { idempotencyKey: k, amount: "10.00", currency: "CAD", receivedOn: "2026-10-06" });
    expect(ok.receivedOn).toBe("2026-10-06");
  });

  it("keys are scoped per owner", async () => {
    const other = await createTestUser();
    const k = key();
    await createIncome(ctxFor(owner), { idempotencyKey: k, amount: "10.00", currency: "CAD", receivedOn: "2026-10-05" });
    const theirs = await createIncome(ctxFor(other), { idempotencyKey: k, amount: "99.00", currency: "USD", receivedOn: "2026-10-05" });
    expect(theirs).toMatchObject({ amountMinor: 9900, currency: "USD" });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["0", 0],
    ["false", false],
    ["an object with a value member", { value: "kept", v: 2 }],
  ])("replays a stored %s result instead of reporting 'still processing'", async (_label, result) => {
    const req = { key: key(), operation: "test.op", request: { a: 1 } };
    const fn = vi.fn(async () => result);
    expect(await withOwner(owner, (tx) => withIdempotency(tx, owner, req, fn))).toEqual(result);
    expect(await withOwner(owner, (tx) => withIdempotency(tx, owner, req, fn))).toEqual(result);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("replays rows stored before responses were wrapped (bare result)", async () => {
    const req = { key: key(), operation: "test.legacy", request: { a: 1 } };
    await withOwner(owner, (tx) =>
      tx.insert(idempotencyRecord).values({
        ownerId: owner,
        key: req.key,
        operation: req.operation,
        requestHash: requestHash(req.operation, req.request),
        response: { id: "legacy-id", amountMinor: 100 },
      }),
    );
    const fn = vi.fn(async () => ({ id: "new" }));
    expect(await withOwner(owner, (tx) => withIdempotency(tx, owner, req, fn))).toEqual({ id: "legacy-id", amountMinor: 100 });
    expect(fn).not.toHaveBeenCalled();
  });
});
