import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAuth, resetAuthForTests } from "@/server/auth/auth";
import { closeDb, getDb } from "@/server/db/client";
import { appRateLimit } from "@/server/db/schema";
import { CLIENT_IP_HEADER } from "@/server/security/client-ip";
import { checkRateLimit, rateLimitStorageKey } from "@/server/security/rate-limit";

import { resetAppData } from "./helpers/db";

async function expireWindow(key: string, secondsAgo: number): Promise<void> {
  await getDb()
    .update(appRateLimit)
    .set({ windowStart: sql`now() - make_interval(secs => ${secondsAgo})` })
    .where(eq(appRateLimit.key, rateLimitStorageKey(key)));
}

describe("checkRateLimit (app_rate_limit, fixed window)", () => {
  beforeAll(resetAppData);
  afterAll(async () => {
    resetAuthForTests();
    await closeDb();
  });

  const rule = { max: 3, windowSeconds: 60 };

  it("allows `max` hits, then blocks with a retry-after inside the window", async () => {
    const key = "test:basic";
    for (let i = 0; i < rule.max; i += 1) {
      expect(await checkRateLimit(key, rule)).toEqual({ ok: true });
    }
    const blocked = await checkRateLimit(key, rule);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(rule.windowSeconds);
  });

  it("reports a shrinking retry-after as the window ages", async () => {
    const key = "test:aging";
    for (let i = 0; i <= rule.max; i += 1) await checkRateLimit(key, rule);
    await expireWindow(key, 45);
    const blocked = await checkRateLimit(key, rule);
    expect(blocked).toMatchObject({ ok: false });
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(15);
  });

  it("resets once the window has passed", async () => {
    const key = "test:reset";
    for (let i = 0; i <= rule.max; i += 1) await checkRateLimit(key, rule);
    expect((await checkRateLimit(key, rule)).ok).toBe(false);

    await expireWindow(key, rule.windowSeconds);
    expect(await checkRateLimit(key, rule)).toEqual({ ok: true });
    const [row] = await getDb().select().from(appRateLimit).where(eq(appRateLimit.key, rateLimitStorageKey(key)));
    expect(row?.count).toBe(1);
  });

  it("keeps keys independent", async () => {
    for (let i = 0; i <= rule.max; i += 1) await checkRateLimit("test:a", rule);
    expect((await checkRateLimit("test:a", rule)).ok).toBe(false);
    expect(await checkRateLimit("test:b", rule)).toEqual({ ok: true });
  });

  it("is atomic under concurrent hits", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit("test:race", { max: 5, windowSeconds: 60 })));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });

  it("never stores the raw identifier", async () => {
    await checkRateLimit("setup:203.0.113.77", rule);
    const rows = await getDb().select({ key: appRateLimit.key }).from(appRateLimit);
    expect(rows.some((r) => r.key.includes("203.0.113.77"))).toBe(false);
    expect(rows.some((r) => r.key === rateLimitStorageKey("setup:203.0.113.77") && r.key.startsWith("setup:"))).toBe(true);
  });

  it("rejects invalid keys and rules", async () => {
    await expect(checkRateLimit("", rule)).rejects.toThrow();
    await expect(checkRateLimit("x".repeat(201), rule)).rejects.toThrow();
    await expect(checkRateLimit("test:x", { max: 0, windowSeconds: 60 })).rejects.toThrow();
    await expect(checkRateLimit("test:x", { max: 1, windowSeconds: 0 })).rejects.toThrow();
  });
});

describe("Better Auth sign-in rate limit (rate_limit table)", () => {
  beforeAll(resetAppData);
  afterAll(async () => {
    resetAuthForTests();
    await closeDb();
  });

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const attempt = (ip: string) =>
    getAuth().handler(
      new Request(`${base}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: new URL(base).origin, [CLIENT_IP_HEADER]: ip },
        body: JSON.stringify({ email: "nobody@example.test", password: "not the password at all" }),
      }),
    );

  it("allows 5 attempts per minute per client IP, then answers 429 with X-Retry-After", async () => {
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 7; i += 1) {
      last = await attempt("198.51.100.20");
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
    const retryAfter = Number(last?.headers.get("x-retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it("keys the limit by the proxy-resolved client IP", async () => {
    expect((await attempt("198.51.100.21")).status).toBe(401);
  });
});
