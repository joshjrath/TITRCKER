import { describe, expect, it } from "vitest";
import { LEAVE_PROMPT, confirmLeave, hasUnsavedChanges, isInAppNavigation, registerUnsavedChanges } from "./unsaved-changes";

const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const link = (href: string, over: Partial<{ target: string; download: boolean }> = {}) => ({ href, target: "", download: false, ...over });
const here = "https://tenth.example/settings?tab=tracking";

describe("isInAppNavigation", () => {
  it("guards plain clicks on links to another page of the app", () => {
    expect(isInAppNavigation(click, link("https://tenth.example/ledger"), here)).toBe(true);
    expect(isInAppNavigation(click, link("https://tenth.example/settings"), here)).toBe(true);
    expect(isInAppNavigation(click, link("https://tenth.example/?period=all"), "https://tenth.example/")).toBe(true);
  });

  it("ignores clicks that keep this page: new tab/window, handled, downloads, in-page anchors, the same URL", () => {
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) {
      expect(isInAppNavigation({ ...click, [key]: true }, link("https://tenth.example/ledger"), here)).toBe(false);
    }
    expect(isInAppNavigation({ ...click, button: 1 }, link("https://tenth.example/ledger"), here)).toBe(false);
    expect(isInAppNavigation({ ...click, defaultPrevented: true }, link("https://tenth.example/ledger"), here)).toBe(false);
    expect(isInAppNavigation(click, link("https://tenth.example/ledger", { target: "_blank" }), here)).toBe(false);
    expect(isInAppNavigation(click, link("https://tenth.example/ledger", { target: "_self" }), here)).toBe(true);
    expect(isInAppNavigation(click, link("https://tenth.example/api/export/csv", { download: true }), here)).toBe(false);
    expect(isInAppNavigation(click, link(`${here}#main`), here)).toBe(false);
    expect(isInAppNavigation(click, link(here), here)).toBe(false);
  });

  it("leaves other sites and malformed URLs to the browser", () => {
    expect(isInAppNavigation(click, link("https://www.bankofcanada.ca/rates"), here)).toBe(false);
    expect(isInAppNavigation(click, link("not a url"), here)).toBe(false);
  });
});

describe("unsaved changes registry", () => {
  it("tracks each dirty form until it unregisters", () => {
    expect(hasUnsavedChanges()).toBe(false);
    const first = registerUnsavedChanges();
    const second = registerUnsavedChanges();
    expect(hasUnsavedChanges()).toBe(true);
    first();
    expect(hasUnsavedChanges()).toBe(true);
    second();
    second();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("asks only while something is unsaved", () => {
    const asked: string[] = [];
    const answer = (value: boolean) => (message: string) => {
      asked.push(message);
      return value;
    };
    expect(confirmLeave(answer(false))).toBe(true);
    expect(asked).toEqual([]);
    const unregister = registerUnsavedChanges();
    expect(confirmLeave(answer(false))).toBe(false);
    expect(confirmLeave(answer(true))).toBe(true);
    expect(asked).toEqual([LEAVE_PROMPT, LEAVE_PROMPT]);
    unregister();
  });
});
