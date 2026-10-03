// Startup housekeeping in scripts/migrate.mjs: after migrating it prunes expired rate-limit rows (app and Better Auth)
// and old idempotency records, logging counts only. Runs the real script against the test database.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb, getDb } from "@/server/db/client";
import { appRateLimit, idempotencyRecord, rateLimit } from "@/server/db/schema";
import { withOwner } from "@/server/db/with-owner";

import { createTestUser, resetAppData } from "./helpers/db";

const run = promisify(execFile);
const migrateScript = fileURLToPath(new URL("../../scripts/migrate.mjs", import.meta.url));
const HASH = "0".repeat(64);
const DAY_MS = 24 * 60 * 60 * 1000;

afterAll(closeDb);

describe("startup housekeeping (scripts/migrate.mjs)", () => {
  let ownerA: string;
  let ownerB: string;
  let output: string;

  beforeAll(async () => {
    await resetAppData();
    ownerA = await createTestUser("a@example.test");
    ownerB = await createTestUser("b@example.test");
    const db = getDb();
    await db.insert(appRateLimit).values([
      { key: "old:1", windowStart: sql`now() - interval '25 hours'`, count: 1 },
      { key: "fresh:1", windowStart: sql`now() - interval '23 hours'`, count: 1 },
    ]);
    await db.insert(rateLimit).values([
      { id: randomUUID(), key: "old-auth", count: 1, lastRequest: Date.now() - DAY_MS - 60_000 },
      { id: randomUUID(), key: "fresh-auth", count: 1, lastRequest: Date.now() - DAY_MS + 60_000 },
    ]);
    for (const owner of [ownerA, ownerB]) {
      await withOwner(owner, (tx) =>
        tx.insert(idempotencyRecord).values([
          { ownerId: owner, key: randomUUID(), operation: "old", requestHash: HASH, createdAt: sql`now() - interval '31 days'` },
          { ownerId: owner, key: randomUUID(), operation: "fresh", requestHash: HASH, createdAt: sql`now() - interval '29 days'` },
        ]),
      );
    }
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not set");
    ({ stdout: output } = await run(process.execPath, [migrateScript, "--url", databaseUrl]));
  });

  it("logs counts only", () => {
    expect(output).toContain(
      "[migrate] housekeeping: removed 1 app rate-limit windows, 1 auth rate-limit rows, 2 idempotency records",
    );
  });

  it("keeps rate-limit rows younger than a day", async () => {
    const appKeys = (await getDb().select({ key: appRateLimit.key }).from(appRateLimit)).map((r) => r.key);
    expect(appKeys).toEqual(["fresh:1"]);
    const authKeys = (await getDb().select({ key: rateLimit.key }).from(rateLimit)).map((r) => r.key);
    expect(authKeys).toEqual(["fresh-auth"]);
  });

  it("removes every owner's idempotency records older than 30 days (row-level security respected)", async () => {
    for (const owner of [ownerA, ownerB]) {
      const rows = await withOwner(owner, (tx) => tx.select({ operation: idempotencyRecord.operation }).from(idempotencyRecord));
      expect(rows.map((r) => r.operation)).toEqual(["fresh"]);
    }
  });
});
