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

test("phone keyboard: the add-income sheet rests on the keyboard with Save visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "visual-390", "phone layout only");
  // Chromium has no on-screen keyboard, so emulate how iOS Safari reports one: the layout viewport keeps its height
  // while window.visualViewport shrinks (and may be panned down the page).
  await page.addInitScript(() => {
    const fake = Object.assign(new EventTarget(), {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
    (window as unknown as { __setKeyboard: (height: number, offsetTop: number) => void }).__setKeyboard = (height, offsetTop) => {
      fake.height = height;
      fake.offsetTop = offsetTop;
      fake.dispatchEvent(new Event("resize"));
    };
  });
  await page.goto("/");
  await page.getByRole("navigation").getByRole("button", { name: /add/i }).last().click();
  const sheet = page.getByRole("dialog", { name: "Add income" });
  await expect(sheet).toBeVisible();

  for (const [height, offsetTop] of [
    [508, 0],
    [508, 120],
  ] as const) {
    await page.evaluate(
      ({ h, o }) => (window as unknown as { __setKeyboard: (h: number, o: number) => void }).__setKeyboard(h, o),
      { h: height, o: offsetTop },
    );
    const visibleBottom = offsetTop + height;
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box ? Math.round(box.y + box.height) : -1;
      })
      .toBe(visibleBottom);
    const box = await sheet.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(offsetTop);
    const save = await sheet.getByRole("button", { name: "Save income" }).boundingBox();
    expect(save!.y + save!.height).toBeLessThanOrEqual(visibleBottom);
    const amount = await sheet.getByLabel("Amount received").boundingBox();
    expect(amount!.y).toBeGreaterThanOrEqual(box!.y);
    await page.screenshot({ path: `e2e/screenshots/${testInfo.project.name}-sheet-keyboard-${offsetTop}.png` });
  }
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
