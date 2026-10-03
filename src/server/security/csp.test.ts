import { describe, expect, it } from "vitest";

import { buildCsp, generateNonce } from "./csp";

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name ?? "", values.join(" ")];
    }),
  );
}

describe("generateNonce", () => {
  it("returns 128-bit base64 values that differ per call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
  });
});

describe("buildCsp (production)", () => {
  const nonce = "abcDEF123+/=";
  const csp = buildCsp({ nonce, isDev: false, upgradeInsecureRequests: true });
  const d = directives(csp);

  it("gates scripts by nonce + strict-dynamic, without unsafe-eval or unsafe-inline", () => {
    expect(d.get("script-src")).toBe(`'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp).not.toContain("unsafe-eval");
    expect(d.get("script-src")).not.toContain("unsafe-inline");
  });

  it("allows nonce'd style elements and inline style attributes only", () => {
    expect(d.get("style-src-elem")).toBe(`'self' 'nonce-${nonce}'`);
    expect(d.get("style-src")).toBe(`'self' 'nonce-${nonce}'`);
    expect(d.get("style-src-attr")).toBe("'unsafe-inline'");
  });

  it("locks down everything else", () => {
    expect(d.get("default-src")).toBe("'self'");
    expect(d.get("img-src")).toBe("'self' data: blob:");
    expect(d.get("font-src")).toBe("'self'");
    expect(d.get("connect-src")).toBe("'self'");
    expect(d.get("object-src")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
    expect(d.get("form-action")).toBe("'self'");
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.has("upgrade-insecure-requests")).toBe(true);
  });

  it("never references third-party origins", () => {
    expect(csp).not.toMatch(/https?:/);
    expect(csp).not.toContain("*");
  });
});

describe("buildCsp (development)", () => {
  const csp = buildCsp({ nonce: "bm9uY2U=", isDev: true, upgradeInsecureRequests: false });
  const d = directives(csp);

  it("adds unsafe-eval for React dev tooling and inline <style> for HMR", () => {
    expect(d.get("script-src")).toBe("'self' 'nonce-bm9uY2U=' 'strict-dynamic' 'unsafe-eval'");
    expect(d.get("style-src-elem")).toBe("'self' 'unsafe-inline'");
    expect(d.has("upgrade-insecure-requests")).toBe(false);
  });
});

describe("buildCsp input validation", () => {
  it("rejects nonces that could inject directives", () => {
    expect(() => buildCsp({ nonce: "x'; script-src *", isDev: false, upgradeInsecureRequests: false })).toThrow();
    expect(() => buildCsp({ nonce: "", isDev: false, upgradeInsecureRequests: false })).toThrow();
  });
});
