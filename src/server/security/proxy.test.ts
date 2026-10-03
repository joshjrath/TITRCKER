import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "@/proxy";

import { CLIENT_IP_HEADER } from "./client-ip";

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  it("runs on pages, auth and API routes", () => {
    for (const url of ["/", "/ledger", "/sign-in", "/sign-in/two-factor", "/setup", "/api/auth/sign-in/email", "/api/export/csv"]) {
      expect(matches(url), url).toBe(true);
    }
  });

  it("skips static assets and the health check", () => {
    for (const url of ["/_next/static/chunks/main.js", "/_next/image?url=x", "/api/health", "/favicon.ico", "/icon.svg", "/robots.txt"]) {
      expect(matches(url), url).toBe(false);
    }
  });
});

describe("proxy", () => {
  it("redirects app pages to /sign-in when no session cookie is present", () => {
    const res = proxy(new NextRequest("http://localhost/ledger?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/sign-in");
  });

  it("serves public auth pages with a nonce CSP and forwards the nonce upstream", () => {
    const res = proxy(new NextRequest("http://localhost/sign-in"));
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-middleware-override-headers")).toContain("x-nonce");
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });

  it("lets signed-in requests through (cookie presence only)", () => {
    const req = new NextRequest("http://localhost/", { headers: { cookie: "tenth.session_token=abc.def" } });
    const res = proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBeTruthy();
  });

  it("forwards the resolved client IP and overwrites a spoofed header", () => {
    const req = new NextRequest("http://localhost/api/auth/get-session", {
      headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.1", [CLIENT_IP_HEADER]: "6.6.6.6" },
    });
    const res = proxy(req);
    expect(res.headers.get(`x-middleware-request-${CLIENT_IP_HEADER}`)).toBe("198.51.100.4");
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("drops a client-supplied IP header when no forwarding header resolves", () => {
    const req = new NextRequest("http://localhost/api/auth/get-session", { headers: { [CLIENT_IP_HEADER]: "6.6.6.6" } });
    const res = proxy(req);
    expect(res.headers.get(`x-middleware-request-${CLIENT_IP_HEADER}`)).toBeNull();
  });
});
