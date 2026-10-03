import { expect, test } from "@playwright/test";

import { AUTH_STATE, watchConsole } from "./helpers";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("financial pages redirect to sign-in", async ({ page }) => {
    for (const path of ["/", "/ledger", "/given", "/set-aside", "/settings"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/sign-in/);
    }
  });

  test("exports refuse unauthenticated requests", async ({ request }) => {
    for (const path of ["/api/export/csv", "/api/export/backup"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
      expect(await response.text(), path).not.toMatch(/CAD|USD/);
    }
  });

  test("public registration and the setup page are closed once the owner exists", async ({ request, baseURL }) => {
    const signUp = await request.post("/api/auth/sign-up/email", {
      headers: { origin: baseURL ?? "" },
      data: { email: "intruder@example.test", password: "intruder-passphrase-1", name: "Intruder" },
    });
    expect(signUp.status()).toBeGreaterThanOrEqual(400);
    expect((await request.get("/setup")).status()).toBe(404);
  });

  test("a forged cross-origin sign-in is rejected", async ({ request }) => {
    const response = await request.post("/api/auth/sign-in/email", {
      headers: { origin: "https://evil.example" },
      data: { email: "owner@e2e.test", password: "wrong-password-123" },
    });
    expect(response.status()).toBe(403);
  });

  test("security headers are present on every response", async ({ request }) => {
    const response = await request.get("/sign-in");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});

test.describe("signed in", () => {
  test.use({ storageState: AUTH_STATE });

  test("pages render without console errors or CSP violations", async ({ page }) => {
    const problems = watchConsole(page);
    for (const path of ["/", "/ledger", "/given", "/set-aside", "/settings"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      expect(response?.headers()["cache-control"], path).toContain("no-store");
      await page.waitForLoadState("networkidle");
    }
    expect(problems).toEqual([]);
  });

  test("the session cookie is HttpOnly and SameSite=Lax", async ({ page }) => {
    await page.goto("/");
    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name.includes("session_token"));
    expect(session).toBeDefined();
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain("session_token");
  });

  test("no amounts or notes are placed in URLs", async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (request) => urls.push(request.url()));
    await page.goto("/ledger");
    await page.waitForLoadState("networkidle");
    expect(urls.filter((url) => /1750|1,750|249\.99|Freelance/.test(decodeURIComponent(url)))).toEqual([]);
  });
});
