import { expect, test, type Page } from "@playwright/test";

import { addIncomeViaQuickEntry, hero, OWNER, quickEntry, signIn, watchConsole } from "./helpers";

/**
 * The full owner journey on a fresh database, with the clock pinned to 2026-10-03 12:00 in Toronto:
 * setup → sign in → empty state → add income → persistence → edit → partial church payment → set aside → export → sign out.
 * Amounts follow the brief's worked example.
 */
test.describe.configure({ mode: "serial" });

let page: Page;
let consoleProblems: string[];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  consoleProblems = watchConsole(page);
});

test.afterAll(async () => {
  await page.close();
});

test("one-time setup creates the owner, then disappears", async () => {
  await page.goto("/setup");
  await page.getByLabel("Setup token").fill(OWNER.setupToken);
  await page.getByLabel("Owner email").fill(OWNER.email);
  await page.getByLabel("Your name").fill(OWNER.name);
  await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
  await page.getByLabel("Confirm password").fill(OWNER.password);
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/sign-in/);

  const again = await page.request.get("/setup");
  expect(again.status()).toBe(404);
});

test("signed-in empty account shows the invitation, the 10% marker and the payout countdown", async () => {
  await signIn(page);
  await expect(page).toHaveURL("/");
  await expect(page.getByText(/every payment counts/i).first()).toBeVisible();
  await expect(page.getByText(/nothing to give right now/i).first()).toBeVisible();
  await expect(page.getByText("10%").first()).toBeVisible();
  await expect(page.getByText("89 days until payout").first()).toBeVisible();
});

test("adding income shows a live 10% preview and updates the balance after save", async () => {
  await addIncomeViaQuickEntry(page, "1,750.00", { expectTithe: "CAD 175.00", source: "Salary" });
  await expect(hero(page)).toContainText("CAD 175.00");

  await addIncomeViaQuickEntry(page, "249.99", { expectTithe: "CAD 25.00", source: "Freelance" });
  await expect(hero(page)).toContainText("CAD 200.00");
  await expect(page.getByText("CAD 1,999.99").first()).toBeVisible();
  await expect(page.getByText(/Oct 3 – Dec 31, 2026/).filter({ visible: true }).first()).toBeVisible();
});

test("invalid amounts are rejected with a text message and keep the entered value", async () => {
  const panel = quickEntry(page);
  const amount = panel.getByLabel("Amount received");
  await amount.fill("1e3");
  await panel.getByRole("button", { name: "Save income" }).click();
  await expect(panel.getByText(/scientific notation is not supported/i)).toBeVisible();
  await expect(amount).toHaveValue("1e3");
  await amount.fill("");
});

test("a double-clicked save records the entry once", async () => {
  const panel = quickEntry(page);
  await panel.getByLabel("Amount received").fill("10.00");
  await panel.getByRole("button", { name: "Save income" }).dblclick();
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
  await expect(hero(page)).toContainText("CAD 201.00");

  await page.goto("/ledger");
  await expect(page.getByText("CAD 10.00", { exact: true }).filter({ visible: true })).toHaveCount(1);
});

test("deleting an entry asks for confirmation and removes its tithe", async () => {
  await page.getByRole("button", { name: /actions for .*10\.00/i }).first().click();
  await page.getByRole("menuitem", { name: /delete/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("CAD 1.00");
  await dialog.getByRole("button", { name: /delete/i }).click();
  await expect(page.getByText(/deleted/i).first()).toBeVisible();
  await page.goto("/");
  await expect(hero(page)).toContainText("CAD 200.00");
});

test("records persist after a reload", async () => {
  await page.reload();
  await expect(hero(page)).toContainText("CAD 200.00");
});

test("editing an entry keeps its tithe and updates the ledger", async () => {
  await page.goto("/ledger");
  await page.getByRole("button", { name: /actions for .*freelance/i }).first().click();
  await page.getByRole("menuitem", { name: /edit/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/payer or source/i).fill("Freelance design");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Freelance design").first()).toBeVisible();
});

test("a partial church payment reduces what is still to give", async () => {
  await page.goto("/given");
  await expect(page.getByText(/never moves money/i)).toBeVisible();
  await page.getByRole("button", { name: /record a payment/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount paid").fill("50.00");
  await dialog.getByLabel("Church", { exact: true }).fill("Grace Community Church");
  await dialog.getByLabel(/I made this payment/).check();
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(dialog).toBeHidden();
  await page.goto("/");
  await expect(hero(page)).toContainText("CAD 150.00");
});

test("setting money aside leaves the amount owed unchanged", async () => {
  await page.goto("/set-aside");
  await page.getByRole("button", { name: /set aside|reserve|add/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/amount reserved/i).fill("100.00");
  await dialog.getByRole("button", { name: /save|reserve|add/i }).last().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/still to set aside/i).first()).toBeVisible();
  await expect(page.getByText("CAD 50.00").first()).toBeVisible();
  await page.goto("/");
  await expect(hero(page)).toContainText("CAD 150.00");
});

test("USD stays separate and the top shows the combined total in CAD at the day's rate", async () => {
  await page.goto("/");
  await addIncomeViaQuickEntry(page, "100.00", { expectTithe: "USD 10.00", source: "US client", currency: "USD" });
  // CAD 150.00 + USD 10.00 × 1.3500 (pinned test rate) = CAD 163.50
  await expect(hero(page)).toContainText("CAD 163.50");
  await expect(page.getByText("Total still to give").first()).toBeVisible();
  const breakdown = page.getByRole("definition").filter({ hasText: "USD 10.00" });
  await expect(breakdown.first()).toContainText("CAD 13.50");
  await expect(page.getByText(/USD→CAD 1\.3500/).first()).toBeVisible();
  await page.goto("/ledger");
  await expect(page.getByText("Total ≈ CAD 163.50").first()).toBeVisible();
});

test("CSV export and JSON backup reconcile with the balance and are never cached", async () => {
  const csv = await page.request.get("/api/export/csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(csv.headers()["cache-control"]).toContain("no-store");
  expect(csv.headers()["content-disposition"]).toContain("attachment");
  const body = await csv.text();
  expect(body).toMatch(/summary_still_to_give[^\r\n]*150\.00/);
  expect(body).toMatch(/summary_accrued[^\r\n]*200\.00/);

  const backupResponse = await page.request.get("/api/export/backup");
  expect(backupResponse.status()).toBe(200);
  expect(backupResponse.headers()["cache-control"]).toContain("no-store");
  const backup = (await backupResponse.json()) as {
    format: string;
    version: number;
    totals: Record<string, { stillToGiveMinor: number; paidMinor: number; accruedMinor: number }>;
  };
  expect(backup.format).toBe("tenth-backup");
  expect(backup.version).toBe(1);
  expect(backup.totals.CAD).toMatchObject({ accruedMinor: 20000, paidMinor: 5000, stillToGiveMinor: 15000 });
});

test("signing out ends the session", async () => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /sign out/i }).first().click();
  await page.waitForURL(/\/sign-in/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
  const csv = await page.request.get("/api/export/csv");
  expect(csv.status()).toBe(401);
});

test("no console errors or CSP violations during the journey", () => {
  const relevant = consoleProblems.filter((text) => !text.includes("401") && !text.includes("Failed to load resource"));
  expect(relevant).toEqual([]);
});
