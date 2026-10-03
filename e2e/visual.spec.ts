import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { AUTH_STATE } from "./helpers";

const PAGES = [
  { name: "overview", path: "/" },
  { name: "ledger", path: "/ledger" },
  { name: "given", path: "/given" },
  { name: "set-aside", path: "/set-aside" },
  { name: "settings", path: "/settings" },
];

test.use({ storageState: AUTH_STATE });

for (const { name, path } of PAGES) {
  test(`${name}: accessible, no horizontal scroll, screenshot`, async ({ page }, testInfo) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
    expect(serious).toEqual([]);

    await page.screenshot({ path: `e2e/screenshots/${testInfo.project.name}-${name}.png`, fullPage: true });
  });
}

test("keyboard: the first Tab stop is the skip link and focus is visible", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveText(/skip to/i);
  const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});

test("reduced motion renders the final balance immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  // The journey leaves CAD 150.00 + USD 10.00 owed; the combined total must render at its final value at once.
  await expect(page.getByTestId("still-to-give-amount")).toContainText("CAD 163.50");
  await page.screenshot({ path: `e2e/screenshots/${test.info().project.name}-overview-reduced-motion.png` });
});

test("the balance stays put when the quick entry opens its details", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "visual-1440", "the quick entry shares the hero's row on desktop only");
  await page.goto("/");
  const amount = page.getByTestId("still-to-give-amount");
  const before = await amount.boundingBox();
  await page.getByRole("button", { name: /add details/i }).click();
  await expect(page.getByLabel(/payer or source/i)).toBeVisible();
  const after = await amount.boundingBox();
  expect(after?.y).toBe(before?.y);
});

test("phone: entry forms open full screen from the top, with Save in the title bar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "visual-390", "phone layout only");
  const viewport = page.viewportSize()!;
  // A typical iPhone keyboard plus Safari's toolbar cover roughly the bottom 400px; nothing needed while typing
  // may live there, and the layout must not depend on how the browser reports the keyboard.
  const keyboardTop = viewport.height - 400;

  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: /add/i }).last().click();
  const sheet = page.getByRole("dialog", { name: "Add income" });
  await expect(sheet).toBeVisible();
  // Let the slide-up animation settle, then the form must cover the whole screen from the top.
  await expect.poll(async () => Math.round((await sheet.boundingBox())?.y ?? -1)).toBe(0);
  const box = (await sheet.boundingBox())!;
  expect(Math.round(box.height)).toBe(viewport.height);

  const save = sheet.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeVisible();
  const saveBox = (await save.boundingBox())!;
  expect(saveBox.y + saveBox.height).toBeLessThan(140);
  const amountBox = (await sheet.getByLabel("Amount received").boundingBox())!;
  expect(amountBox.y + amountBox.height).toBeLessThan(keyboardTop);
  // The form's own bottom button is replaced by the title-bar one on phones.
  await expect(sheet.getByRole("button", { name: "Save income" })).toBeHidden();
  await page.screenshot({ path: `e2e/screenshots/${testInfo.project.name}-add-income-sheet.png` });

  // The title-bar Save submits the form (empty amount → the field's validation message, nothing saved).
  await save.click();
  await expect(sheet.getByText(/enter an amount/i).first()).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  await page.goto("/given");
  await page.getByRole("button", { name: /record a payment/i }).first().click();
  const payment = page.getByRole("dialog", { name: /record a payment/i });
  await expect(payment).toBeVisible();
  await expect.poll(async () => Math.round((await payment.boundingBox())?.y ?? -1)).toBe(0);
  const record = payment.getByRole("button", { name: "Record", exact: true });
  await expect(record).toBeVisible();
  expect(((await record.boundingBox())!).y).toBeLessThan(140);
  const paid = (await payment.getByLabel("Amount paid").boundingBox())!;
  expect(paid.y + paid.height).toBeLessThan(keyboardTop);
  await page.screenshot({ path: `e2e/screenshots/${testInfo.project.name}-payment-sheet.png` });
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sign-in page is accessible", async ({ page }, testInfo) => {
    await page.goto("/sign-in");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await page.screenshot({ path: `e2e/screenshots/${testInfo.project.name}-sign-in.png`, fullPage: true });
  });
});
