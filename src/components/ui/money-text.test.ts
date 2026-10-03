import { describe, expect, it } from "vitest";
import { keepMoneyTogether } from "./money-text";

const NBSP = " ";

describe("keepMoneyTogether", () => {
  it("joins every currency code to the amount after it", () => {
    expect(keepMoneyTogether("Set aside CAD 100.00 · still to set aside CAD 1,363.59")).toBe(
      `Set aside CAD${NBSP}100.00 · still to set aside CAD${NBSP}1,363.59`,
    );
    expect(keepMoneyTogether("Includes USD 30.00 carried over from 2025")).toBe(`Includes USD${NBSP}30.00 carried over from 2025`);
  });

  it("keeps signed amounts together", () => {
    expect(keepMoneyTogether("tithe CAD −5.00 and USD -2.50")).toBe(`tithe CAD${NBSP}−5.00 and USD${NBSP}-2.50`);
  });

  it("leaves a code that is not followed by an amount alone", () => {
    expect(keepMoneyTogether("Nothing to give in CAD · credit in USD")).toBe("Nothing to give in CAD · credit in USD");
    expect(keepMoneyTogether("ABCAD 10.00")).toBe("ABCAD 10.00");
  });
});
