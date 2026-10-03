import { describe, expect, it } from "vitest";
import { fieldRevealOffset, isTextEntryTag } from "./dialog-fields";

describe("isTextEntryTag", () => {
  it("counts fields that bring up a keyboard or picker", () => {
    expect(isTextEntryTag("INPUT", "text")).toBe(true);
    expect(isTextEntryTag("input", "")).toBe(true);
    expect(isTextEntryTag("INPUT", "date")).toBe(true);
    expect(isTextEntryTag("TEXTAREA")).toBe(true);
    expect(isTextEntryTag("SELECT")).toBe(true);
  });

  it("ignores toggles, buttons and other elements", () => {
    expect(isTextEntryTag("INPUT", "checkbox")).toBe(false);
    expect(isTextEntryTag("INPUT", "radio")).toBe(false);
    expect(isTextEntryTag("INPUT", "submit")).toBe(false);
    expect(isTextEntryTag("BUTTON")).toBe(false);
    expect(isTextEntryTag("DIV")).toBe(false);
  });
});

describe("fieldRevealOffset", () => {
  // A 402x874 iPhone screen with the sheet body starting under a 70px title bar.
  const bodyTop = 70;
  const height = 874;

  it("leaves a field high on the screen where it is", () => {
    expect(fieldRevealOffset(bodyTop, 90, 180, height)).toBe(0);
    expect(fieldRevealOffset(bodyTop, 280, height * 0.4, height)).toBe(0);
  });

  it("scrolls a lower field up to just under the title bar", () => {
    expect(fieldRevealOffset(bodyTop, 447, 491, height)).toBe(447 - 70 - 16);
    expect(fieldRevealOffset(bodyTop, 620.4, 700, height)).toBe(534);
  });

  it("never scrolls backwards", () => {
    expect(fieldRevealOffset(bodyTop, 60, 500, height)).toBe(0);
  });
});
