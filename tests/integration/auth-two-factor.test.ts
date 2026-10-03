import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAuth, resetAuthForTests } from "@/server/auth/auth";
import { createOwnerAccount } from "@/server/auth/owner";
import { closeDb } from "@/server/db/client";
import { CLIENT_IP_HEADER } from "@/server/security/client-ip";

import { resetAppData } from "./helpers/db";

const PASSWORD = "correct horse battery staple";
const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of input.replace(/=+$/, "").toUpperCase()) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new Error("bad base32");
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), independent of Better Auth's implementation. */
function totp(secret: Buffer, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const mac = createHmac("sha1", secret).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

/** Minimal cookie jar around Better Auth's real HTTP handler. */
class Client {
  private jar = new Map<string, string>();
  constructor(private readonly ip: string) {}

  get cookieHeader(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      origin: new URL(BASE).origin,
      [CLIENT_IP_HEADER]: this.ip,
    };
    if (this.jar.size > 0) headers.cookie = this.cookieHeader;
    const res = await getAuth().handler(new Request(`${BASE}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
    for (const c of res.headers.getSetCookie()) {
      const [pair = ""] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (/max-age=0/i.test(c) || value === "") this.jar.delete(name);
      else this.jar.set(name, value);
    }
    const text = await res.text();
    return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  }

  async session() {
    return getAuth().api.getSession({ headers: new Headers({ cookie: this.cookieHeader }) });
  }
}

describe("two-factor sign-in (Better Auth twoFactor plugin)", () => {
  let secret: Buffer;
  let backupCodes: string[];
  const email = (process.env.OWNER_EMAIL ?? "").toLowerCase();

  beforeAll(async () => {
    await resetAppData();
    const created = await createOwnerAccount({ email, name: "Owner", password: PASSWORD });
    if (!created.ok) throw new Error(`owner setup failed: ${created.code}`);
  });
  afterAll(async () => {
    resetAuthForTests();
    await closeDb();
  });

  it("enrolls: enable returns a TOTP URI + backup codes, and stays inactive until a code is verified", async () => {
    const client = new Client("192.0.2.50");
    expect((await client.post("/sign-in/email", { email, password: PASSWORD })).status).toBe(200);

    const sessionHeaders = new Headers({ cookie: client.cookieHeader });
    const enabled = await getAuth().api.enableTwoFactor({ headers: sessionHeaders, body: { password: PASSWORD } });
    expect(enabled.method).toBe("totp");
    if (enabled.method !== "totp") return;
    const uri = new URL(enabled.totpURI);
    expect(uri.protocol).toBe("otpauth:");
    expect(decodeURIComponent(uri.pathname)).toContain("Tenth");
    expect(uri.searchParams.get("issuer")).toBe("Tenth");
    secret = base32Decode(uri.searchParams.get("secret") ?? "");
    backupCodes = enabled.backupCodes;
    expect(backupCodes).toHaveLength(10);

    expect((await client.session())?.user.twoFactorEnabled).toBeFalsy();

    await expect(getAuth().api.verifyTOTP({ headers: sessionHeaders, body: { code: "000000" } })).rejects.toMatchObject({
      body: { code: "INVALID_CODE" },
    });
    await getAuth().api.verifyTOTP({ headers: sessionHeaders, body: { code: totp(secret) } });
  });

  it("requires the second factor at the next sign-in, and completes with a TOTP code", async () => {
    const client = new Client("192.0.2.51");
    const signIn = await client.post("/sign-in/email", { email, password: PASSWORD });
    expect(signIn.status).toBe(200);
    expect(signIn.json.twoFactorRedirect).toBe(true);
    expect(await client.session()).toBeNull();

    const verify = await client.post("/two-factor/verify-totp", { code: totp(secret), trustDevice: false });
    expect(verify.status).toBe(200);
    expect((await client.session())?.user.email).toBe(email);
  });

  it("accepts a backup code once", async () => {
    const client = new Client("192.0.2.52");
    await client.post("/sign-in/email", { email, password: PASSWORD });
    const code = backupCodes[0] ?? "";
    expect((await client.post("/two-factor/verify-backup-code", { code })).status).toBe(200);
    expect((await client.session())?.user.email).toBe(email);

    const again = new Client("192.0.2.53");
    await again.post("/sign-in/email", { email, password: PASSWORD });
    const reuse = await again.post("/two-factor/verify-backup-code", { code });
    expect(reuse.status).toBe(401);
    expect(await again.session()).toBeNull();
  });

  it("rejects a verify call without a pending two-factor challenge", async () => {
    const stranger = new Client("192.0.2.54");
    const res = await stranger.post("/two-factor/verify-totp", { code: totp(secret) });
    expect(res.status).toBe(401);
    expect(res.json.code).toBe("INVALID_TWO_FACTOR_COOKIE");
  });

  it("disables with the password, after which sign-in needs only the password", async () => {
    const client = new Client("192.0.2.55");
    await client.post("/sign-in/email", { email, password: PASSWORD });
    await client.post("/two-factor/verify-totp", { code: totp(secret) });
    await expect(
      getAuth().api.disableTwoFactor({ headers: new Headers({ cookie: client.cookieHeader }), body: { password: "wrong password!!" } }),
    ).rejects.toMatchObject({ body: { code: "INVALID_PASSWORD" } });
    await getAuth().api.disableTwoFactor({ headers: new Headers({ cookie: client.cookieHeader }), body: { password: PASSWORD } });

    const fresh = new Client("192.0.2.56");
    const signIn = await fresh.post("/sign-in/email", { email, password: PASSWORD });
    expect(signIn.json.twoFactorRedirect).toBeUndefined();
    expect((await fresh.session())?.user.twoFactorEnabled).toBeFalsy();
  });
});
