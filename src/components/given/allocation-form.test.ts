import { describe, expect, it } from "vitest";

import { computeBalances, toMinor, type BucketPosition } from "@/domain";
import { d, income, m, opening, payment, snapshot } from "@/domain/testFixtures";

import {
  allocationErrorsByYear,
  allocationInputs,
  creditExplanation,
  openBuckets,
  parsedAmountOrNull,
  previewAllocation,
  splitDraftFrom,
} from "./allocation-form";

/** ARCHITECTURE worked example plus an older opening balance: 2025 owes 30.00, 2026 owes 200.00. */
function cadBuckets(): BucketPosition[] {
  const snap = snapshot({
    incomes: [income({ amount: "1,750.00", on: "2026-10-05" }), income({ amount: "249.99", on: "2026-10-20" })],
    openings: [opening({ amount: "30.00", on: "2025-06-01" })],
  });
  return computeBalances(snap, d("2026-10-03")).CAD.buckets;
}

describe("previewAllocation (suggested split)", () => {
  it("covers the oldest period first", () => {
    const p = previewAllocation(m("50.00"), "CAD", cadBuckets(), null);
    expect(p.lines.map((l) => [l.bucketYear, l.amountMinor])).toEqual([
      [2025, 3000],
      [2026, 2000],
    ]);
    expect(p.lines[1]?.label).toBe("2026 (Oct 3 – Dec 31)");
    expect(p.creditMinor).toBe(0);
    expect(p.totalOutstandingMinor).toBe(23000);
    expect(p.error).toBeNull();
  });

  it("turns an overpayment into credit and explains it", () => {
    const p = previewAllocation(m("250.00"), "CAD", cadBuckets(), null);
    expect(p.creditMinor).toBe(2000);
    expect(p.excessMinor).toBe(2000);
    expect(creditExplanation(p, "CAD")).toBe(
      "This is CAD 20.00 more than you owe. The extra is kept as credit and applied to future tithe in CAD.",
    );
  });

  it("is all credit when nothing is owed", () => {
    const p = previewAllocation(m("10.00"), "USD", [], null);
    expect(p.lines).toEqual([]);
    expect(p.creditMinor).toBe(1000);
  });
});

describe("previewAllocation (adjusted split)", () => {
  it("accepts a split within each period and the payment, leaving the rest as credit", () => {
    const p = previewAllocation(m("100.00"), "CAD", cadBuckets(), { 2025: "", 2026: "90" });
    expect(p.lines.map((l) => [l.bucketYear, l.amountMinor])).toEqual([[2026, 9000]]);
    expect(p.creditMinor).toBe(1000);
    expect(p.excessMinor).toBe(0);
    expect(creditExplanation(p, "CAD")).toContain("CAD 10.00 of this payment isn't assigned to a period");
  });

  it("treats 0 and 0.00 as nothing for that period", () => {
    const p = previewAllocation(m("30.00"), "CAD", cadBuckets(), { 2025: "0.00", 2026: "30.00" });
    expect(p.error).toBeNull();
    expect(p.lines).toHaveLength(1);
  });

  it("flags a line above the period's outstanding amount", () => {
    const p = previewAllocation(m("100.00"), "CAD", cadBuckets(), { 2025: "40.00" });
    expect(p.lineErrors[2025]).toBe("Only CAD 30.00 is outstanding for 2025.");
    expect(p.error).not.toBeNull();
    expect(p.creditMinor).toBe(0);
  });

  it("flags unparseable amounts with the domain message", () => {
    const p = previewAllocation(m("100.00"), "CAD", cadBuckets(), { 2026: "1,00" });
    expect(p.lineErrors[2026]).toMatch(/Enter an amount like/);
  });

  it("rejects a split larger than the payment", () => {
    const p = previewAllocation(m("50.00"), "CAD", cadBuckets(), { 2025: "30.00", 2026: "30.00" });
    expect(p.error).toBe("The split adds up to CAD 60.00, which is more than the payment of CAD 50.00.");
  });
});

describe("helpers", () => {
  it("lists open buckets oldest first and skips covered ones", () => {
    const snap = snapshot({
      incomes: [income({ amount: "1,000.00", on: "2026-10-05" })],
      openings: [opening({ amount: "30.00", on: "2025-06-01" })],
      payments: [payment({ amount: "30.00", on: "2026-10-06", allocations: [[2025, "30.00"]] })],
    });
    const buckets = computeBalances(snap, d("2026-10-03")).CAD.buckets;
    expect(openBuckets(buckets).map((b) => b.year)).toEqual([2026]);
  });

  it("builds drafts and payloads as plain decimals", () => {
    const buckets = cadBuckets();
    const p = previewAllocation(m("1,050.00"), "CAD", buckets, null);
    expect(splitDraftFrom(p.lines, buckets)).toEqual({ 2025: "30.00", 2026: "200.00" });
    expect(allocationInputs([{ bucketYear: 2026, label: "", amountMinor: toMinor(123456) }])).toEqual([
      { bucketYear: 2026, amount: "1234.56" },
    ]);
  });

  it("parses the typed amount strictly", () => {
    expect(parsedAmountOrNull("1,750.00")).toBe(175000);
    expect(parsedAmountOrNull("1.750,00")).toBeNull();
    expect(parsedAmountOrNull("")).toBeNull();
  });

  it("maps server allocation errors back to bucket years", () => {
    const errors = { allocations: "Only CAD 10.00 is outstanding for 2026.", "allocations.1.amount": "Too much" };
    expect(allocationErrorsByYear(errors, [{ bucketYear: 2025 }, { bucketYear: 2026 }])).toEqual({ 2026: "Too much" });
  });
});
