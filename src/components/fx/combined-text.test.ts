import { describe, expect, it } from "vitest";

import { toMinor } from "@/domain";
import type { CombinedAmountVM, CombinedTotalVM, FxRateVM } from "@/lib/view-models";

import {
  chartCurrencyNote,
  combinedOneLiner,
  combinedPartsText,
  combinedRateNote,
  isApproximate,
  ledgerCombinedLine,
  ledgerCombinedSegments,
  rateLine,
  spokenCombined,
  spokenCombinedAmount,
} from "./combined-text";

const combined = (patch: Partial<CombinedTotalVM> = {}): CombinedTotalVM =>
  ({
    status: "combined",
    totalCadMinor: 16_350,
    cadMinor: 15_000,
    usdMinor: 1_000,
    usdInCadMinor: 1_350,
    rate: { value: "1.3500", observedOn: "2026-10-02", sourceLabel: "Bank of Canada", stale: false },
    ...patch,
  }) as CombinedTotalVM;

describe("combined total wording", () => {
  it("states the rate, its source and date", () => {
    expect(rateLine(combined())).toBe("USD→CAD 1.3500 · Bank of Canada · Oct 2, 2026 · updates daily");
  });

  it("marks a stale rate as the last available one", () => {
    const stale = combined({
      rate: { value: "1.3500", observedOn: "2026-09-20", sourceLabel: "Bank of Canada", stale: true } as CombinedTotalVM["rate"],
    });
    expect(rateLine(stale)).toContain("last available rate");
  });

  it("spells out the approximation for screen readers", () => {
    expect(spokenCombined(combined())).toBe("approximately CAD 163.50 in total, including USD 10.00 converted at 1.3500");
  });

  it("gives a compact header line only when USD was converted", () => {
    expect(combinedOneLiner(combined())).toBe("Total ≈ CAD 163.50 (USD at 1.3500, Oct 2)");
    expect(combinedOneLiner(combined({ status: "cad_only", rate: null }))).toBeNull();
    expect(combinedOneLiner(combined({ status: "unavailable", totalCadMinor: null, rate: null }))).toBeNull();
  });
});

describe("combined period figures and ledger line wording", () => {
  const rate = { value: "1.4145", observedOn: "2026-09-25", sourceLabel: "Bank of Canada", stale: false } as FxRateVM;
  const amount = (cad: number, usd: number, usdInCad: number): CombinedAmountVM => ({
    totalCadMinor: toMinor(cad + usdInCad),
    cadMinor: toMinor(cad),
    usdMinor: toMinor(usd),
    usdInCadMinor: toMinor(usdInCad),
  });
  const income = amount(520_300, 175_000, 247_538);

  it("lists the separate amounts and spells out the conversion for screen readers", () => {
    expect(combinedPartsText(income)).toBe("CAD 5,203.00 · USD 1,750.00");
    expect(spokenCombinedAmount(income, rate)).toBe(
      "approximately CAD 7,678.38 in CAD, including USD 1,750.00 converted at 1.4145",
    );
    expect(isApproximate(income)).toBe(true);
  });

  it("does not call a figure approximate when there is no USD in it", () => {
    const given = amount(5_000, 0, 0);
    expect(isApproximate(given)).toBe(false);
    expect(spokenCombinedAmount(given, rate)).toBe("CAD 50.00 in CAD, nothing in USD");
  });

  it("names the rate, its source and date, and the chart currency", () => {
    expect(combinedRateNote(rate)).toBe("≈ CAD totals include USD converted at 1.4145 (Bank of Canada, Sep 25)");
    expect(combinedRateNote({ ...rate, stale: true })).toContain("last available rate");
    expect(chartCurrencyNote("USD")).toBe("The charts and monthly breakdown show USD only.");
  });

  it("builds the ledger's combined line (the owner's numbers)", () => {
    const totals = { received: income, refunded: amount(0, 0, 0), tithe: amount(52_030, 17_500, 24_754) };
    expect(ledgerCombinedLine(totals, rate)).toBe("Total ≈ CAD 7,678.38 received · ≈ CAD 767.84 tithe (USD at 1.4145)");
    expect(ledgerCombinedSegments(totals, rate)).toHaveLength(3);
  });

  it("adds refunds to the ledger line when there are any (≈ only when USD was converted)", () => {
    const totals = { received: income, refunded: amount(1_000, 0, 0), tithe: amount(52_030, 17_500, 24_754) };
    expect(ledgerCombinedLine(totals, rate)).toBe(
      "Total ≈ CAD 7,678.38 received · CAD 10.00 refunded · ≈ CAD 767.84 tithe after refunds (USD at 1.4145)",
    );
    const both = { ...totals, refunded: amount(1_000, 2_500, 3_536) };
    expect(ledgerCombinedLine(both, rate)).toContain("· ≈ CAD 45.36 refunded ·");
  });

  it("speaks a combined figure without converted USD plainly, even without a rate", () => {
    expect(spokenCombinedAmount(amount(3_000, 0, 0), null)).toBe("CAD 30.00 in CAD, nothing in USD");
  });
});
