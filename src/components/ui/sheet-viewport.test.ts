import { describe, expect, it } from "vitest";

import { sheetPlacement } from "./sheet-viewport";

describe("sheetPlacement", () => {
  it("leaves the sheet at the bottom when no keyboard is shown", () => {
    expect(sheetPlacement({ layoutHeight: 844, visualHeight: 844, visualOffsetTop: 0 })).toEqual({
      bottom: 0,
      height: 844,
      keyboardOpen: false,
    });
  });

  it("lifts the sheet onto an iOS keyboard (layout viewport stays full height)", () => {
    // iPhone 390×844: keyboard ~336px tall, visual viewport shrinks to 508px.
    expect(sheetPlacement({ layoutHeight: 844, visualHeight: 508, visualOffsetTop: 0 })).toEqual({
      bottom: 336,
      height: 508,
      keyboardOpen: true,
    });
  });

  it("accounts for iOS panning the visual viewport down the page", () => {
    expect(sheetPlacement({ layoutHeight: 844, visualHeight: 508, visualOffsetTop: 120 })).toMatchObject({
      bottom: 216,
      height: 508,
      keyboardOpen: true,
    });
  });

  it("needs no lift when the browser resizes the layout viewport itself (Android resizes-content)", () => {
    expect(sheetPlacement({ layoutHeight: 508, visualHeight: 508, visualOffsetTop: 0 })).toMatchObject({
      bottom: 0,
      keyboardOpen: false,
    });
  });

  it("ignores small toolbar movements", () => {
    expect(sheetPlacement({ layoutHeight: 844, visualHeight: 790, visualOffsetTop: 0 }).keyboardOpen).toBe(false);
  });

  it("never returns negative distances", () => {
    expect(sheetPlacement({ layoutHeight: 800, visualHeight: 844, visualOffsetTop: 10 })).toMatchObject({ bottom: 0 });
  });
});
