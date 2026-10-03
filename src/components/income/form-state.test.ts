import { describe, expect, it } from "vitest";
import { toLocalDate, toMinor } from "@/domain";
import type { IncomeRowVM } from "@/lib/view-models";
import { initialIncomeValues, isIncomeFormDirty, optionalInput, splitFieldErrors } from "./form-state";
import { incomeSavedMessage } from "./messages";

const defaults = { today: "2026-10-03", currency: "USD" as const, trackingStart: "2026-10-03", categories: [] };

const row: IncomeRowVM = {
  id: "8d6c0a8e-8a5b-4d0e-9a59-0d6c7b1f7c11",
  currency: "CAD",
  amountMinor: toMinor(175_000),
  receivedOn: toLocalDate("2026-10-02"),
  source: "Employer",
  category: null,
  note: null,
  titheMinor: toMinor(17_500),
  titheRateBps: 1000,
  refundedMinor: toMinor(0),
  netAmountMinor: toMinor(175_000),
  netTitheMinor: toMinor(17_500),
  refundableMinor: toMinor(175_000),
  version: 3,
  createdAt: "2026-10-02T12:00:00.000Z",
  updatedAt: "2026-10-02T12:00:00.000Z",
  adjustments: [],
};

describe("initialIncomeValues", () => {
  it("starts a new entry today in the last used currency", () => {
    expect(initialIncomeValues(defaults)).toEqual({ amount: "", currency: "USD", receivedOn: "2026-10-03", source: "", category: "", note: "" });
  });

  it("loads an entry for editing with a strict-parser-friendly amount", () => {
    expect(initialIncomeValues(defaults, row)).toEqual({
      amount: "1,750.00",
      currency: "CAD",
      receivedOn: "2026-10-02",
      source: "Employer",
      category: "",
      note: "",
    });
  });
});

describe("isIncomeFormDirty", () => {
  const start = initialIncomeValues(defaults);
  it("ignores a currency switch on a blank new entry but not in edit mode", () => {
    expect(isIncomeFormDirty({ ...start, currency: "CAD" }, start, "create")).toBe(false);
    expect(isIncomeFormDirty({ ...start, currency: "CAD" }, start, "edit")).toBe(true);
  });
  it("treats typed input as dirty and whitespace-only changes as clean", () => {
    expect(isIncomeFormDirty({ ...start, amount: "12" }, start, "create")).toBe(true);
    expect(isIncomeFormDirty({ ...start, note: "   " }, start, "create")).toBe(false);
  });
});

describe("splitFieldErrors", () => {
  it("keeps field messages by field and collects the rest once", () => {
    expect(
      splitFieldErrors({ amount: "Enter an amount.", idempotencyKey: "Reload.", expectedVersion: "Reload.", form: "Oops" }),
    ).toEqual({ fields: { amount: "Enter an amount." }, other: ["Reload.", "Oops"] });
    expect(splitFieldErrors(undefined)).toEqual({ fields: {}, other: [] });
  });
});

describe("optionalInput", () => {
  it("sends blank optional text as undefined", () => {
    expect(optionalInput("  ")).toBeUndefined();
    expect(optionalInput(" Gift ")).toBe(" Gift ");
  });
});

describe("incomeSavedMessage", () => {
  const result = { id: row.id, currency: "CAD" as const, amountMinor: toMinor(175_000), titheMinor: toMinor(17_500), receivedOn: toLocalDate("2026-10-03") };
  it("says what was added to the tithe, with the currency code", () => {
    expect(incomeSavedMessage(result, "create")).toEqual({ title: "Saved · CAD 175.00 added to your tithe", description: "CAD 1,750.00 received." });
    expect(incomeSavedMessage(result, "edit").title).toBe("Updated · this entry's tithe is now CAD 175.00");
  });
});
