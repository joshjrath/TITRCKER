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

test("Overview: Romans 8:18 stays pinned and every reload shows a different verse", async ({ page }) => {
  await page.goto("/");
  const pinned = page.getByTestId("pinned-verse");
  const rotating = page.getByTestId("rotating-verse");
  await expect(pinned).toContainText("Romans 8:18 · NLT");
  await expect(pinned).toContainText("Yet what we suffer now is nothing compared to the glory he will reveal to us later.");
  // The page records the verse it showed in a cookie once it has loaded; the next render then skips that verse.
  const shownCookie = async () => (await page.context().cookies()).find((c) => c.name === "tenth-verse")?.value ?? "";
  let previous = await rotating.locator("figcaption").innerText();
  let recorded = "";
  for (let i = 0; i < 3; i += 1) {
    await expect.poll(shownCookie).not.toBe(recorded);
    recorded = await shownCookie();
    await page.reload();
    await expect(pinned).toContainText("Romans 8:18");
    const current = await rotating.locator("figcaption").innerText();
    expect(current).toMatch(/· NLT$/);
    expect(current).not.toBe(previous);
    previous = current;
  }
});

test("privacy: the eye hides every amount on every page and remembers it", async ({ page }, testInfo) => {
  /** Amounts ("1,234.56") on screen whose digits are not drawn as privacy dots (dialogs and form fields excluded). */
  const visibleAmounts = () =>
    page.evaluate(async () => {
      await document.fonts.ready;
      const money = /\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/;
      // A figure can be split over nested spans ("1,463" + ".59"), so also look at the spans around it.
      const looksLikeMoney = (el: Element) => {
        const parent = el.parentElement?.tagName === "SPAN" ? el.parentElement : null;
        const grandparent = parent?.parentElement?.tagName === "SPAN" ? parent.parentElement : null;
        return [el, parent, grandparent].some((a) => a && (a.textContent ?? "").length <= 40 && money.test(a.textContent ?? ""));
      };
      const shown: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || !/\d/.test(node.nodeValue ?? "") || !looksLikeMoney(el)) continue;
        if (el.closest("script, style, [role=dialog], input, textarea, select, .sr-only")) continue;
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (box.width <= 1 || box.height <= 1 || style.visibility === "hidden" || style.display === "none") continue;
        if (!style.fontFamily.replaceAll('"', "").startsWith("Tenth Privacy")) shown.push((node.nodeValue ?? "").trim());
      }
      return shown;
    });

  await page.goto("/");
  await expect(page.getByTestId("still-to-give-amount")).toBeVisible();
  expect((await visibleAmounts()).length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Hide amounts" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-privacy", "on");
  await expect(page.getByRole("button", { name: "Show amounts" }).first()).toBeVisible();
  expect(await page.evaluate(() => document.fonts.check('16px "Tenth Privacy"', "0"))).toBe(true);
  expect(await visibleAmounts()).toEqual([]);
  await page.screenshot({ path: `e2e/screenshots/${testInfo.project.name}-overview-privacy.png` });

  // Every page stays hidden, including after a reload (no flash of real numbers: the server renders it hidden).
  for (const path of ["/ledger", "/given", "/set-aside", "/settings"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-privacy", "on");
    expect(await visibleAmounts(), path).toEqual([]);
  }
  await page.goto("/ledger");
  const served = await (await page.request.get("/ledger")).text();
  expect(served).toContain('data-privacy="on"');

  // The eye on another page turns it off again.
  await page.getByRole("button", { name: "Show amounts" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-privacy", "off");
  expect((await visibleAmounts()).length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-privacy", "off");
});

test("the balance stays put when the quick entry opens its details", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "visual-1440", "the quick entry shares the hero's row on desktop only");
  await page.goto("/");
  const amount = page.getByTestId("still-to-give-amount");
  // Position on the page, not in the viewport: clicking may scroll the button into view.
  const pageTop = () => amount.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const before = await pageTop();
  await page.getByRole("button", { name: /add details/i }).click();
  await expect(page.getByLabel(/payer or source/i)).toBeVisible();
  expect(await pageTop()).toBe(before);
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
  // The title bar stays one line tall (the description scrolls with the form).
  expect(((await sheet.locator("header").boundingBox())!).height).toBeLessThan(80);
  await page.screenshot({ path: `e2e/screenshots/${testInfo.project.name}-add-income-sheet.png` });

  // Focusing a lower field scrolls the sheet body so the field sits above the keyboard. Otherwise iOS pans the whole
  // screen to reveal it, which slides the fixed sheet (and its title-bar Save) off the top.
  await sheet.getByLabel(/category/i).focus();
  const category = (await sheet.getByLabel(/category/i).boundingBox())!;
  expect(category.y + category.height).toBeLessThan(keyboardTop);
  expect(category.y).toBeGreaterThan(((await save.boundingBox())!).y);
  await sheet.getByLabel(/note/i).focus();
  const note = (await sheet.getByLabel(/note/i).boundingBox())!;
  expect(note.y + note.height).toBeLessThan(keyboardTop);
  // The form's own Save stays too, right below the last field.
  await expect(sheet.getByRole("button", { name: "Save income" })).toBeVisible();

  // The title-bar Save submits the form (empty amount → the field's validation message, nothing saved).
  await save.click();
  await expect(sheet.getByText(/enter an amount/i).first()).toBeVisible();
  await expect(sheet.getByLabel("Amount received")).toBeFocused();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();

  // Editing an entry uses the same full-screen layout.
  await page.goto("/ledger");
  await page.getByRole("button", { name: /^Actions for/ }).first().click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit income" });
  await expect.poll(async () => Math.round((await edit.boundingBox())?.y ?? -1)).toBe(0);
  expect(((await edit.getByRole("button", { name: "Save", exact: true }).boundingBox())!).y).toBeLessThan(140);
  await edit.getByRole("button", { name: "Close" }).click();
  await expect(edit).toBeHidden();

  // Centered confirmations sit near the top, so their buttons stay clear of the keyboard.
  await page.getByRole("button", { name: /^Actions for/ }).first().click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: /delete/i });
  await expect.poll(async () => Math.round((await confirm.boundingBox())?.y ?? -1)).toBeLessThan(60);
  await confirm.getByRole("button", { name: "Close" }).click();
  await expect(confirm).toBeHidden();

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
