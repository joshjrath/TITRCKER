import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  getOwner: vi.fn(),
  checkRateLimit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ getOwner: mocks.getOwner }));
vi.mock("@/server/security/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  RATE_LIMITS: { mutation: { max: 60, windowSeconds: 60 }, export: { max: 10, windowSeconds: 300 } },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import type { ActionResult } from "@/lib/action-result";
import { GET as backupGET } from "@/app/api/export/backup/route";
import { GET as csvGET } from "@/app/api/export/csv/route";
import { GET as healthGET } from "@/app/api/health/route";
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
import { updateSettingsAction } from "@/server/actions/settings";
import { closeDb } from "@/server/db/client";
import { incomeEntry } from "@/server/db/schema";
import { withOwner } from "@/server/db/with-owner";

import { createTestUser, resetAppData } from "./helpers/db";
import { key } from "./helpers/services";

/** A browser download started from Tenth itself (or the address bar, with `site: "none"`). */
const exportRequest = (site?: string) =>
  new Request("http://localhost:3000/api/export", { headers: site ? { "sec-fetch-site": site } : {} });

afterAll(closeDb);

const savedEnv = { mode: process.env.TENTH_TEST_MODE, now: process.env.TENTH_TEST_NOW };
beforeAll(() => {
  // Pin the server clock (honored only in test mode): 2026-10-10 noon in Toronto.
  process.env.TENTH_TEST_MODE = "1";
  process.env.TENTH_TEST_NOW = "2026-10-10T16:00:00Z";
});
afterAll(() => {
  process.env.TENTH_TEST_MODE = savedEnv.mode;
  process.env.TENTH_TEST_NOW = savedEnv.now;
  if (savedEnv.mode === undefined) delete process.env.TENTH_TEST_MODE;
  if (savedEnv.now === undefined) delete process.env.TENTH_TEST_NOW;
});

let owner: string;
beforeEach(async () => {
  await resetAppData();
  owner = await createTestUser("actions@example.test");
  mocks.getOwner.mockReset().mockResolvedValue({ ownerId: owner, email: "actions@example.test" });
  mocks.checkRateLimit.mockReset().mockResolvedValue({ ok: true });
  mocks.revalidatePath.mockReset();
});

const uuid = "00000000-0000-4000-8000-000000000000";

// Every financial Server Action, each with a structurally valid input.
const ACTIONS: [string, (input: never) => Promise<ActionResult<unknown>>, unknown][] = [
  ["createIncomeAction", createIncomeAction, { idempotencyKey: uuid, amount: "1.00", currency: "CAD", receivedOn: "2026-10-05" }],
  ["updateIncomeAction", updateIncomeAction, { idempotencyKey: uuid, id: uuid, expectedVersion: 1, amount: "1.00", currency: "CAD", receivedOn: "2026-10-05" }],
  ["deleteIncomeAction", deleteIncomeAction, { idempotencyKey: uuid, id: uuid }],
  ["restoreIncomeAction", restoreIncomeAction, { idempotencyKey: uuid, id: uuid }],
  ["createAdjustmentAction", createAdjustmentAction, { idempotencyKey: uuid, incomeId: uuid, kind: "refund", amount: "1.00", effectiveOn: "2026-10-05", reason: "r" }],
  ["deleteAdjustmentAction", deleteAdjustmentAction, { idempotencyKey: uuid, id: uuid }],
  ["recordPaymentAction", recordPaymentAction, { idempotencyKey: uuid, amount: "1.00", currency: "CAD", paidOn: "2026-10-05", churchName: "G", allocations: "auto", confirmCredit: true, confirmMadePayment: true, drawFromSetAside: false }],
  ["reversePaymentAction", reversePaymentAction, { idempotencyKey: uuid, id: uuid, reason: "r" }],
  ["updatePaymentDetailsAction", updatePaymentDetailsAction, { idempotencyKey: uuid, id: uuid, expectedVersion: 1, churchName: "G" }],
  ["createSetAsideAction", createSetAsideAction, { idempotencyKey: uuid, kind: "reserve", amount: "1.00", currency: "CAD", effectiveOn: "2026-10-05" }],
  ["deleteSetAsideAction", deleteSetAsideAction, { idempotencyKey: uuid, id: uuid }],
  ["createOpeningObligationAction", createOpeningObligationAction, { idempotencyKey: uuid, amount: "1.00", currency: "CAD", effectiveOn: "2026-10-05" }],
  ["updateOpeningObligationAction", updateOpeningObligationAction, { idempotencyKey: uuid, id: uuid, expectedVersion: 1, amount: "1.00", currency: "CAD", effectiveOn: "2026-10-05" }],
  ["deleteOpeningObligationAction", deleteOpeningObligationAction, { idempotencyKey: uuid, id: uuid }],
  ["updateSettingsAction", updateSettingsAction, { idempotencyKey: uuid, expectedVersion: 1, trackingStart: "2026-10-03", timeZone: "America/Toronto", displayCurrency: "USD", churchName: "", nextPayoutDate: "2026-12-31" }],
];

describe("Server Actions: authentication and rate limiting", () => {
  it.each(ACTIONS)("%s returns 'unauthorized' without a session and does nothing", async (_name, action, input) => {
    mocks.getOwner.mockResolvedValue(null);
    const result = await action(input as never);
    expect(result).toMatchObject({ ok: false, code: "unauthorized" });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(ACTIONS)("%s returns 'rate_limited' when the limiter denies and does nothing", async (_name, action, input) => {
    mocks.checkRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 42 });
    const result = await action(input as never);
    expect(result).toMatchObject({ ok: false, code: "rate_limited" });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(`mutation:${owner}`, { max: 60, windowSeconds: 60 });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(ACTIONS)("%s rejects malformed input with 'validation' (never throws)", async (_name, action) => {
    for (const bad of [null, undefined, "x", 42, { idempotencyKey: "nope" }]) {
      const result = await action(bad as never);
      expect(result).toMatchObject({ ok: false, code: "validation" });
    }
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("Server Actions: results", () => {
  it("creates income for the SESSION owner, then revalidates the layout", async () => {
    const result = await createIncomeAction({ idempotencyKey: key(), amount: "1,750.00", currency: "CAD", receivedOn: "2026-10-10" });
    expect(result).toMatchObject({ ok: true, message: "Income added.", data: { amountMinor: 175000, titheMinor: 17500 } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    const rows = await withOwner(owner, (tx) => tx.select().from(incomeEntry).where(eq(incomeEntry.ownerId, owner)));
    expect(rows).toHaveLength(1);
  });

  it("returns field errors from validation and service rules", async () => {
    const badAmount = await createIncomeAction({ idempotencyKey: key(), amount: "1.234", currency: "CAD", receivedOn: "2026-10-05" });
    expect(badAmount).toMatchObject({ ok: false, code: "validation", fieldErrors: { amount: expect.any(String) } });

    const future = await createIncomeAction({ idempotencyKey: key(), amount: "1.00", currency: "CAD", receivedOn: "2026-10-11" });
    expect(future).toMatchObject({ ok: false, code: "validation", fieldErrors: { receivedOn: expect.any(String) } });

    const credit = await recordPaymentAction({
      idempotencyKey: key(),
      amount: "5.00",
      currency: "CAD",
      paidOn: "2026-10-10",
      churchName: "Grace",
      allocations: "auto",
      confirmCredit: false,
      confirmMadePayment: true,
      drawFromSetAside: false,
    });
    expect(credit).toMatchObject({ ok: false, code: "validation", fieldErrors: { confirmCredit: expect.any(String) } });

    const missing = await reversePaymentAction({ idempotencyKey: key(), id: uuid, reason: "x" });
    expect(missing).toMatchObject({ ok: false, code: "not_found" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps unexpected failures to a generic server_error without details", async () => {
    mocks.getOwner.mockRejectedValue(new Error("connection refused at 10.0.0.1 password=hunter2"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await createIncomeAction({ idempotencyKey: key(), amount: "1.00", currency: "CAD", receivedOn: "2026-10-05" });
    expect(result).toEqual({ ok: false, code: "server_error", message: expect.any(String) });
    if (!result.ok) expect(result.message).not.toMatch(/hunter2|10\.0\.0\.1|connection/);
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toMatch(/hunter2|1\.00/);
    spy.mockRestore();
  });

  it("settings action returns the updated settings", async () => {
    const result = await updateSettingsAction({
      idempotencyKey: key(),
      expectedVersion: 1,
      trackingStart: "2026-10-03",
      timeZone: "America/Toronto",
      displayCurrency: "USD",
      churchName: "Grace",
      nextPayoutDate: "2026-12-15",
    });
    expect(result).toMatchObject({ ok: true, data: { displayCurrency: "USD", churchName: "Grace", nextPayoutIsDefault: false, version: 2 } });
  });
});

describe("route handlers", () => {
  it("export routes answer 401 without a session", async () => {
    mocks.getOwner.mockResolvedValue(null);
    for (const GET of [csvGET, backupGET]) {
      const res = await GET(exportRequest("same-origin"));
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(await res.json()).toMatchObject({ ok: false, code: "unauthorized" });
    }
  });

  it("export routes answer 429 when rate limited", async () => {
    mocks.checkRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 120 });
    const res = await csvGET(exportRequest("same-origin"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("120");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(`export:${owner}`, { max: 10, windowSeconds: 300 });
  });

  it("export routes refuse downloads started by another site, before any rate limit", async () => {
    for (const site of ["cross-site", "same-site"]) {
      for (const GET of [csvGET, backupGET]) {
        const res = await GET(exportRequest(site));
        expect(res.status).toBe(403);
        expect(res.headers.get("cache-control")).toBe("private, no-store");
        expect(await res.json()).toMatchObject({ ok: false, code: "forbidden" });
      }
    }
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it("export routes allow same-origin, address-bar (none) and header-less requests", async () => {
    for (const site of ["same-origin", "none", undefined]) {
      expect((await csvGET(exportRequest(site))).status).toBe(200);
      expect((await backupGET(exportRequest(site))).status).toBe(200);
    }
  });

  it("CSV export: attachment, BOM, private no-store, nosniff", async () => {
    await createIncomeAction({ idempotencyKey: key(), amount: "100.00", currency: "CAD", receivedOn: "2026-10-05" });
    const res = await csvGET(exportRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="tenth-ledger-2026-10-10.csv"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("backup export: JSON attachment", async () => {
    const res = await backupGET(exportRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="tenth-backup-2026-10-10.json"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toMatchObject({ format: "tenth-backup", version: 1, account: { email: "actions@example.test" } });
  });

  it("health check returns ok without data", async () => {
    const res = await healthGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
