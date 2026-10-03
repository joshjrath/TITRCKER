import { expect, type Locator, type Page } from "@playwright/test";

/** Credentials used by the E2E server (scripts/e2e-server.mjs). Test-only values. */
export const OWNER = {
  email: "owner@e2e.test",
  name: "E2E Owner",
  password: "e2e-owner-passphrase-2026",
  setupToken: "e2e-setup-token-0123456789",
};

export const AUTH_STATE = "e2e/.auth/owner.json";

export async function signIn(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

/** The "Still to give" hero region on the Overview (its text includes the visually hidden full amount). */
export function hero(page: Page): Locator {
  return page.locator("section", { has: page.getByText("Still to give", { exact: true }) }).first();
}

/** The desktop quick-entry panel on the Overview. */
export function quickEntry(page: Page): Locator {
  return page.getByRole("region", { name: "Add income" });
}

export async function addIncomeViaQuickEntry(
  page: Page,
  amount: string,
  options: { expectTithe?: string; source?: string } = {},
): Promise<void> {
  const panel = quickEntry(page);
  await panel.getByLabel("Amount received").fill(amount);
  if (options.expectTithe) await expect(panel).toContainText(options.expectTithe);
  if (options.source) {
    const toggle = panel.getByRole("button", { name: /add details/i });
    if (await toggle.isVisible()) await toggle.click();
    await panel.getByLabel(/payer or source/i).fill(options.source);
  }
  await panel.getByRole("button", { name: "Save income" }).click();
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
}

/** Collects console errors and CSP violations for a page. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  page.on("pageerror", (err) => problems.push(err.message));
  return problems;
}
