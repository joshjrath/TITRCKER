import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getAuth, resetAuthForTests } from "@/server/auth/auth";
import { createOwnerAccount, ownerExists } from "@/server/auth/owner";
import { closeDb, getDb } from "@/server/db/client";
import { account, user } from "@/server/db/schema";
import { CLIENT_IP_HEADER } from "@/server/security/client-ip";

import { resetAppData } from "./helpers/db";

const PASSWORD = "correct horse battery staple";
const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function ownerEmail(): string {
  const email = process.env.OWNER_EMAIL;
  if (!email) throw new Error("OWNER_EMAIL must be set for integration tests");
  return email.toLowerCase();
}

/** Calls a Better Auth endpoint through its real HTTP handler (origin check, rate limit, cookies). */
async function callAuth(path: string, body: unknown, ip: string, extra: Record<string, string> = {}): Promise<Response> {
  return getAuth().handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(BASE).origin, [CLIENT_IP_HEADER]: ip, ...extra },
      body: JSON.stringify(body),
    }),
  );
}

describe("owner bootstrap", () => {
  beforeAll(resetAppData);
  afterAll(async () => {
    resetAuthForTests();
    await closeDb();
  });

  it("rejects an email other than OWNER_EMAIL and creates nothing", async () => {
    const result = await createOwnerAccount({ email: "intruder@example.test", name: "Intruder", password: PASSWORD });
    expect(result).toMatchObject({ ok: false, code: "email_not_allowed" });
    expect(await ownerExists()).toBe(false);
  });

  it("rejects a short password before touching the database", async () => {
    const result = await createOwnerAccount({ email: ownerEmail(), name: "Owner", password: "too-short" });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(result.ok ? null : result.fieldErrors?.password).toBeTruthy();
    expect(await ownerExists()).toBe(false);
  });

  it("creates the owner once, case-insensitively, with a hashed credential password", async () => {
    const result = await createOwnerAccount({ email: ownerEmail().toUpperCase(), name: "  Owner  ", password: PASSWORD });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await getDb().select().from(user).where(eq(user.id, result.userId));
    expect(row).toMatchObject({ email: ownerEmail(), name: "Owner", emailVerified: true });

    const accounts = await getDb().select().from(account).where(eq(account.userId, result.userId));
    expect(accounts).toHaveLength(1);
    const credential = accounts[0];
    expect(credential?.providerId).toBe("credential");
    expect(credential?.password).toBeTruthy();
    expect(credential?.password).not.toContain(PASSWORD);
    expect(credential?.password).not.toBe(PASSWORD);
    const ctx = await getAuth().$context;
    expect(await ctx.password.verify({ hash: credential?.password ?? "", password: PASSWORD })).toBe(true);
    expect(await ctx.password.verify({ hash: credential?.password ?? "", password: `${PASSWORD}!` })).toBe(false);
  });

  it("refuses a second owner, even with the owner email", async () => {
    const again = await createOwnerAccount({ email: ownerEmail(), name: "Owner 2", password: PASSWORD });
    expect(again).toMatchObject({ ok: false, code: "owner_exists" });
    expect(await getDb().select({ id: user.id }).from(user)).toHaveLength(1);
  });

  it("blocks every other creation path through the database hook", async () => {
    const ctx = await getAuth().$context;
    await expect(
      ctx.internalAdapter.createUser({ email: "second@example.test", name: "Second" }, { method: "email-password" }),
    ).rejects.toMatchObject({ body: { code: "EMAIL_NOT_ALLOWED" } });
    await expect(
      ctx.internalAdapter.createUser({ email: ownerEmail(), name: "Dup" }, { method: "email-password" }),
    ).rejects.toMatchObject({ body: { code: "OWNER_EXISTS" } });
    expect(await getDb().select({ id: user.id }).from(user)).toHaveLength(1);
  });

  it("keeps public sign-up disabled", async () => {
    const res = await callAuth("/sign-up/email", { email: ownerEmail(), name: "x", password: PASSWORD }, "192.0.2.10");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await getDb().select({ id: user.id }).from(user)).toHaveLength(1);
  });

  it("signs in with the owner password and sets an HttpOnly, SameSite=Lax session cookie", async () => {
    const res = await callAuth("/sign-in/email", { email: ownerEmail(), password: PASSWORD }, "192.0.2.11");
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    const sessionCookie = cookies.find((c) => /^(__Secure-)?tenth\.session_token=/.test(c));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).toMatch(/Path=\//);

    const token = sessionCookie?.split(";")[0] ?? "";
    const session = await getAuth().api.getSession({ headers: new Headers({ cookie: token }) });
    expect(session?.user.email).toBe(ownerEmail());
  });

  it("rejects a wrong password with a generic 401", async () => {
    const res = await callAuth("/sign-in/email", { email: ownerEmail(), password: "wrong password here" }, "192.0.2.12");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("rejects auth calls from an untrusted origin when a session cookie is present", async () => {
    const signIn = await callAuth("/sign-in/email", { email: ownerEmail(), password: PASSWORD }, "192.0.2.13");
    const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const res = await callAuth("/sign-out", {}, "192.0.2.13", { cookie, origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });
});

describe("owner bootstrap under concurrency", () => {
  beforeEach(resetAppData);
  afterAll(async () => {
    resetAuthForTests();
    await closeDb();
  });

  it("creates exactly one owner when attempts race", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createOwnerAccount({ email: ownerEmail(), name: `Owner ${i}`, password: PASSWORD })),
    );
    expect(attempts.filter((a) => a.ok)).toHaveLength(1);
    expect(attempts.filter((a) => !a.ok).every((a) => !a.ok && a.code === "owner_exists")).toBe(true);
    expect(await getDb().select({ id: user.id }).from(user)).toHaveLength(1);
  });
});
