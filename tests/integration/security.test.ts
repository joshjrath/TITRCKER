// Adversarial security checks across the backend: database role and RLS catalog state, cross-account access through
// the real Server Actions and export routes (session owner B attacking owner A's ids), client-supplied owner ids,
// the global auth brake on /api/auth, disabled sign-up, and the one-time /setup action.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  getOwner: vi.fn(),
  revalidatePath: vi.fn(),
  requestHeaders: new Headers(),
}));

vi.mock("@/server/auth/session", () => ({ getOwner: mocks.getOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: async () => mocks.requestHeaders }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import type { ActionResult } from "@/lib/action-result";
import { POST as authPOST } from "@/app/api/auth/[...all]/route";
import { GET as backupGET } from "@/app/api/export/backup/route";
import { GET as csvGET } from "@/app/api/export/csv/route";
import { setupOwnerAction } from "@/server/actions/auth";
import {
  createAdjustmentAction,
  createIncomeAction,
  deleteAdjustmentAction,
  deleteIncomeAction,
  restoreIncomeAction,
  updateIncomeAction,
} from "@/server/actions/income";
import { createOpeningObligationAction, deleteOpeningObligationAction, updateOpeningObligationAction } from "@/server/actions/opening";
import { recordPaymentAction, reversePaymentAction, updatePaymentDetailsAction } from "@/server/actions/payments";
import { createSetAsideAction, deleteSetAsideAction } from "@/server/actions/set-aside";
import { resetAuthForTests } from "@/server/auth/auth";
import { createOwnerAccount } from "@/server/auth/owner";
import { closeDb, getDb, getPool } from "@/server/db/client";
import { incomeEntry, user } from "@/server/db/schema";
import { withOwner } from "@/server/db/with-owner";
import { GLOBAL_AUTH_LIMITS } from "@/server/security/auth-brake";
import { CLIENT_IP_HEADER } from "@/server/security/client-ip";
import { checkRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { createAdjustment, deleteIncome } from "@/server/services/income";
import { createOpening } from "@/server/services/opening";
import { createSetAside } from "@/server/services/set-aside";

import { createTestUser, resetAppData } from "./helpers/db";
import { addIncome, balancesFor, pay } from "./helpers/ledger";
import { ctxFor, key } from "./helpers/services";

const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const OWNER_TABLES = [
  "app_settings",
  "income_entry",
  "income_adjustment",
  "opening_obligation",
  "church_payment",
  "payment_allocation",
  "set_aside_entry",
  "idempotency_record",
  "audit_event",
];

const savedEnv = { mode: process.env.TENTH_TEST_MODE, now: process.env.TENTH_TEST_NOW, token: process.env.OWNER_SETUP_TOKEN };
beforeAll(() => {
  process.env.TENTH_TEST_MODE = "1";
  process.env.TENTH_TEST_NOW = "2026-10-10T16:00:00Z";
});
afterAll(async () => {
  for (const [name, value] of [
    ["TENTH_TEST_MODE", savedEnv.mode],
    ["TENTH_TEST_NOW", savedEnv.now],
    ["OWNER_SETUP_TOKEN", savedEnv.token],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetAuthForTests();
  await closeDb();
});

const ok = <T>(result: ActionResult<T>): T => {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}`);
  return result.data;
};

describe("database role and row-level security catalog", () => {
  it("the app connects as a role that is neither superuser nor BYPASSRLS", async () => {
    const { rows } = await getPool().query(
      "SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    expect(rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
  });

  it("every table with an owner_id column has RLS enabled AND forced, with an owner policy", async () => {
    const { rows } = await getPool().query<{ table: string; enabled: boolean; forced: boolean; policies: number }>(`
      SELECT c.relname AS table, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
             (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'owner_id' AND NOT a.attisdropped)
      ORDER BY c.relname`);
    expect(rows.map((r) => r.table).sort()).toEqual([...OWNER_TABLES].sort());
    for (const r of rows) {
      expect(r, r.table).toMatchObject({ enabled: true, forced: true });
      expect(r.policies, r.table).toBeGreaterThan(0);
    }
  });

  it("every owner policy compares owner_id with the transaction-local app.owner_id", async () => {
    const { rows } = await getPool().query<{ tablename: string; qual: string | null; with_check: string | null }>(
      "SELECT tablename, qual, with_check FROM pg_policies WHERE schemaname = 'public'",
    );
    for (const p of rows) {
      const expr = p.qual ?? p.with_check ?? "";
      expect(expr, p.tablename).toMatch(/owner_id = current_setting\('app\.owner_id'::text, true\)/);
    }
  });
});

describe("cross-account access through Server Actions and export routes", () => {
  let ownerA: string;
  let ownerB: string;
  let incomeA: string;
  let adjustmentA: string;
  let deletedIncomeA: string;
  let paymentA: string;
  let setAsideA: string;
  let openingA: string;

  beforeEach(async () => {
    await resetAppData();
    ownerA = await createTestUser("a@example.test");
    ownerB = await createTestUser("b@example.test");
    incomeA = (await addIncome(ownerA, "1,000.00", "2026-10-05", { today: "2026-10-10" })).id;
    deletedIncomeA = (await addIncome(ownerA, "50.00", "2026-10-04", { today: "2026-10-10" })).id;
    await deleteIncome(ctxFor(ownerA), { idempotencyKey: key(), id: deletedIncomeA });
    adjustmentA = (
      await createAdjustment(ctxFor(ownerA), { idempotencyKey: key(), incomeId: incomeA, kind: "refund", amount: "10.00", effectiveOn: "2026-10-06", reason: "r" })
    ).id;
    paymentA = (await pay(ownerA, "40.00", "2026-10-06", { today: "2026-10-10", note: "A-private-note" })).id;
    setAsideA = (
      await createSetAside(ctxFor(ownerA), { idempotencyKey: key(), kind: "reserve", amount: "25.00", currency: "CAD", effectiveOn: "2026-10-07" })
    ).id;
    openingA = (
      await createOpening(ctxFor(ownerA), { idempotencyKey: key(), amount: "70.00", currency: "CAD", effectiveOn: "2026-01-01", label: "A-label" })
    ).id;
    // The attacker is signed in as owner B.
    mocks.getOwner.mockReset().mockResolvedValue({ ownerId: ownerB, email: "b@example.test" });
    mocks.revalidatePath.mockReset();
  });

  it("every mutation of owner A's records by id answers not_found and changes nothing", async () => {
    const before = await balancesFor(ownerA);
    const attempts: [string, Promise<ActionResult<unknown>>][] = [
      ["updateIncome", updateIncomeAction({ idempotencyKey: key(), id: incomeA, expectedVersion: 1, amount: "1.00", currency: "CAD", receivedOn: "2026-10-05" })],
      ["deleteIncome", deleteIncomeAction({ idempotencyKey: key(), id: incomeA })],
      ["restoreIncome", restoreIncomeAction({ idempotencyKey: key(), id: deletedIncomeA })],
      ["refundIncome", createAdjustmentAction({ idempotencyKey: key(), incomeId: incomeA, kind: "refund", amount: "1.00", effectiveOn: "2026-10-06", reason: "x" })],
      ["deleteAdjustment", deleteAdjustmentAction({ idempotencyKey: key(), id: adjustmentA })],
      ["reversePayment", reversePaymentAction({ idempotencyKey: key(), id: paymentA, reason: "x" })],
      ["updatePayment", updatePaymentDetailsAction({ idempotencyKey: key(), id: paymentA, expectedVersion: 1, churchName: "Hijack" })],
      ["deleteSetAside", deleteSetAsideAction({ idempotencyKey: key(), id: setAsideA })],
      ["updateOpening", updateOpeningObligationAction({ idempotencyKey: key(), id: openingA, expectedVersion: 1, amount: "1.00", currency: "CAD", effectiveOn: "2026-01-01" })],
      ["deleteOpening", deleteOpeningObligationAction({ idempotencyKey: key(), id: openingA })],
    ];
    for (const [name, attempt] of attempts) {
      expect(await attempt, name).toMatchObject({ ok: false, code: "not_found" });
    }
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(await balancesFor(ownerA)).toEqual(before);
  });

  it("B cannot allocate a payment to A's tithe or draw on A's set-aside", async () => {
    const before = await balancesFor(ownerA);
    // Explicit allocation to a year in which only A has an obligation.
    const explicit = await recordPaymentAction({
      idempotencyKey: key(),
      amount: "10.00",
      currency: "CAD",
      paidOn: "2026-10-06",
      churchName: "G",
      allocations: [{ bucketYear: 2026, amount: "10.00" }],
      confirmCredit: false,
      confirmMadePayment: true,
      drawFromSetAside: false,
    });
    expect(explicit).toMatchObject({ ok: false, code: "validation" });
    const drawn = ok(
      await recordPaymentAction({
        idempotencyKey: key(),
        amount: "10.00",
        currency: "CAD",
        paidOn: "2026-10-08",
        churchName: "G",
        allocations: "auto",
        confirmCredit: true,
        confirmMadePayment: true,
        drawFromSetAside: true,
      }),
    );
    expect(drawn).toBeTruthy();
    const b = await balancesFor(ownerB);
    expect(b.CAD.setAsideMinor).toBe(0);
    expect(await balancesFor(ownerA)).toEqual(before);
  });

  it("an ownerId smuggled into the input is ignored: the row belongs to the session owner", async () => {
    const created = ok(
      await createIncomeAction({ idempotencyKey: key(), amount: "5.00", currency: "CAD", receivedOn: "2026-10-05", ownerId: ownerA, owner_id: ownerA } as never),
    );
    const rowsB = await withOwner(ownerB, (tx) => tx.select().from(incomeEntry).where(eq(incomeEntry.id, created.id)));
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]?.ownerId).toBe(ownerB);
    const rowsA = await withOwner(ownerA, (tx) => tx.select().from(incomeEntry).where(eq(incomeEntry.id, created.id)));
    expect(rowsA).toHaveLength(0);
  });

  it("reusing owner A's idempotency key does not replay A's stored response to B", async () => {
    const sharedKey = key();
    mocks.getOwner.mockResolvedValue({ ownerId: ownerA, email: "a@example.test" });
    const forA = ok(await createSetAsideAction({ idempotencyKey: sharedKey, kind: "reserve", amount: "3.00", currency: "CAD", effectiveOn: "2026-10-08" }));
    mocks.getOwner.mockResolvedValue({ ownerId: ownerB, email: "b@example.test" });
    const forB = ok(await createSetAsideAction({ idempotencyKey: sharedKey, kind: "reserve", amount: "3.00", currency: "CAD", effectiveOn: "2026-10-08" }));
    expect(forB.id).not.toBe(forA.id);
    expect((await balancesFor(ownerB)).CAD.setAsideMinor).toBe(300);
  });

  it("export routes for B contain none of A's ids or text", async () => {
    const csv = await (await csvGET()).text();
    const backup = await (await backupGET()).text();
    for (const body of [csv, backup]) {
      for (const secret of [incomeA, deletedIncomeA, adjustmentA, paymentA, setAsideA, openingA, "A-private-note", "A-label", "a@example.test"]) {
        expect(body).not.toContain(secret);
      }
    }
    expect(JSON.parse(backup)).toMatchObject({ account: { email: "b@example.test" } });
  });

  it("without a session every financial action and export is refused", async () => {
    mocks.getOwner.mockResolvedValue(null);
    expect(await createIncomeAction({ idempotencyKey: key(), amount: "5.00", currency: "CAD", receivedOn: "2026-10-05" })).toMatchObject({
      ok: false,
      code: "unauthorized",
    });
    expect(await createOpeningObligationAction({ idempotencyKey: key(), amount: "5.00", currency: "CAD", effectiveOn: "2026-10-05" })).toMatchObject({
      ok: false,
      code: "unauthorized",
    });
    expect((await csvGET()).status).toBe(401);
    expect((await backupGET()).status).toBe(401);
  });
});

describe("cross-owner links are impossible even with raw SQL", () => {
  it("B cannot attach an allocation or a set-aside release to A's payment", async () => {
    await resetAppData();
    const ownerA = await createTestUser("a@example.test");
    const ownerB = await createTestUser("b@example.test");
    await addIncome(ownerA, "1,000.00", "2026-10-05", { today: "2026-10-10" });
    const paymentA = (await pay(ownerA, "40.00", "2026-10-06", { today: "2026-10-10" })).id;

    const client = await getPool().connect();
    try {
      for (const statement of [
        {
          text: `INSERT INTO payment_allocation (owner_id, payment_id, currency, bucket_year, amount_minor) VALUES ($1, $2, 'CAD', 2001, 1)`,
          values: [ownerB, paymentA],
        },
        {
          text: `INSERT INTO set_aside_entry (owner_id, kind, currency, amount_minor, effective_on, payment_id)
                 VALUES ($1, 'release', 'CAD', 1, '2026-10-06', $2)`,
          values: [ownerB, paymentA],
        },
      ]) {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.owner_id', $1, true)", [ownerB]);
        await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        await expect(client.query(statement.text, statement.values)).rejects.toMatchObject({ code: "23503" });
        await client.query("ROLLBACK");
      }
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});

describe("auth endpoints (route handler)", () => {
  beforeEach(async () => {
    await resetAppData();
    resetAuthForTests();
  });

  const signInRequest = (ip: string) =>
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: new URL(BASE).origin,
        "x-forwarded-for": `${ip}, 10.0.0.1`,
        [CLIENT_IP_HEADER]: ip,
      },
      body: JSON.stringify({ email: "owner@example.test", password: "not the password at all" }),
    });

  it("a global brake stops credential guessing even when every request claims a new client IP", async () => {
    const rule = GLOBAL_AUTH_LIMITS["/sign-in/email"]!;
    // Below the global ceiling, failures come from Better Auth itself (401), not the brake.
    const first = await authPOST(signInRequest("198.51.100.1"));
    expect(first.status).toBe(401);
    // Exhaust the global bucket (as a rotating-IP attacker would), then try from yet another "IP".
    for (let i = 1; i < rule.max; i += 1) await checkRateLimit("auth-global:/sign-in/email", rule);
    const blocked = await authPOST(signInRequest("203.0.113.250"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("x-retry-after"))).toBeGreaterThan(0);
    expect(blocked.headers.get("cache-control")).toBe("no-store");
  });

  it("public sign-up is disabled at the HTTP layer", async () => {
    const res = await authPOST(
      new Request(`${BASE}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: new URL(BASE).origin, [CLIENT_IP_HEADER]: "198.51.100.9" },
        body: JSON.stringify({ email: "owner@example.test", password: "a long enough password", name: "Mallory" }),
      }),
    );
    expect(res.status).toBe(404);
    expect(await getDb().select().from(user)).toHaveLength(0);
  });
});

describe("session cookie in production over HTTPS", () => {
  const PROD_URL = "https://tenth-test.onrender.com";
  const saved = { nodeEnv: process.env.NODE_ENV, url: process.env.BETTER_AUTH_URL };

  beforeAll(async () => {
    await resetAppData();
    resetAuthForTests();
    await createOwnerAccount({ email: process.env.OWNER_EMAIL ?? "", name: "Owner", password: "correct horse battery staple" });
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = PROD_URL;
    resetAuthForTests();
  });
  afterAll(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = saved.nodeEnv;
    if (saved.url === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = saved.url;
    resetAuthForTests();
  });

  it("is __Secure- prefixed, Secure, HttpOnly and SameSite=Lax; foreign origins are refused", async () => {
    const request = (origin: string) =>
      new Request(`${PROD_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, [CLIENT_IP_HEADER]: "198.51.100.30" },
        body: JSON.stringify({ email: process.env.OWNER_EMAIL, password: "correct horse battery staple" }),
      });
    expect((await authPOST(request("https://evil.example"))).status).toBe(403);
    const res = await authPOST(request(PROD_URL));
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("__Secure-tenth.session_token="));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/; Secure/i);
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; SameSite=Lax/i);
  });
});

describe("one-time /setup action", () => {
  const TOKEN = "setup-token-for-tests-0123456789";
  const input = (token: string) => ({ token, email: process.env.OWNER_EMAIL ?? "owner@example.test", name: "Owner", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" });

  beforeEach(async () => {
    await resetAppData();
    resetAuthForTests();
    process.env.OWNER_SETUP_TOKEN = TOKEN;
    mocks.requestHeaders = new Headers({ [CLIENT_IP_HEADER]: "198.51.100.20" });
  });

  it("is unavailable when no setup token is configured", async () => {
    delete process.env.OWNER_SETUP_TOKEN;
    expect(await setupOwnerAction(input(TOKEN))).toMatchObject({ ok: false, code: "not_found" });
    expect(await getDb().select().from(user)).toHaveLength(0);
  });

  it("rejects a wrong token, accepts the right one once, then is gone", async () => {
    expect(await setupOwnerAction(input("wrong-token-wrong-token"))).toMatchObject({ ok: false, code: "validation", fieldErrors: { token: expect.any(String) } });
    expect(await getDb().select().from(user)).toHaveLength(0);
    await expect(setupOwnerAction(input(TOKEN))).rejects.toThrow("REDIRECT:/sign-in?setup=done");
    expect(await getDb().select().from(user)).toHaveLength(1);
    // After the owner exists, even the correct token is useless.
    expect(await setupOwnerAction(input(TOKEN))).toMatchObject({ ok: false, code: "not_found" });
  });

  it("rejects an email other than OWNER_EMAIL even with the right token", async () => {
    const result = await setupOwnerAction({ ...input(TOKEN), email: "mallory@example.test" });
    expect(result).toMatchObject({ ok: false, code: "validation", fieldErrors: { email: expect.any(String) } });
    expect(await getDb().select().from(user)).toHaveLength(0);
  });

  it("a deployment-wide ceiling applies even when every attempt claims a new client IP", async () => {
    for (let i = 0; i < RATE_LIMITS.setupGlobal.max; i += 1) await checkRateLimit("setup-global:all", RATE_LIMITS.setupGlobal);
    mocks.requestHeaders = new Headers({ [CLIENT_IP_HEADER]: "203.0.113.99" });
    expect(await setupOwnerAction(input(TOKEN))).toMatchObject({ ok: false, code: "rate_limited" });
    expect(await getDb().select().from(user)).toHaveLength(0);
  });

  it("a hostile client IP header is only ever used as a hashed rate-limit key", async () => {
    mocks.requestHeaders = new Headers({ [CLIENT_IP_HEADER]: "'; DROP TABLE app_rate_limit; --" });
    expect(await setupOwnerAction(input("wrong-token-wrong-token"))).toMatchObject({ ok: false, code: "validation" });
    const { rows } = await getDb().execute(sql`SELECT count(*)::int AS n FROM app_rate_limit`);
    expect(rows[0]).toBeDefined();
  });
});
