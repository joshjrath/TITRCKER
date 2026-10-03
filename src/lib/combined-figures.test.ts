import { describe, expect, it } from "vitest";

import { toLocalDate, toMinor, type PeriodSummary } from "@/domain";

import { combinedPeriodFigures, combinedStillToGiveFrom, fxRateVM } from "./combined-figures";
import type { FxRateVM } from "./view-models";

const m = toMinor;
const rate: FxRateVM = { value: "1.4145", observedOn: toLocalDate("2026-09-25"), sourceLabel: "Bank of Canada", stale: true };
const range = { key: 2026, start: toLocalDate("2026-10-03"), end: toLocalDate("2026-12-31"), label: "Oct 3 – Dec 31, 2026" } as const;

function summary(over: Partial<PeriodSummary>): PeriodSummary {
  return {
    currency: "CAD",
    range,
    grossIncomeMinor: m(0),
    refundedMinor: m(0),
    netIncomeMinor: m(0),
    accruedMinor: m(0),
    openingMinor: m(0),
    givenMinor: m(0),
    creditAppliedMinor: m(0),
    outstandingMinor: m(0),
    entryCount: 0,
    ...over,
  };
}

// The owner's report: CAD 5,203.00 (2 entries) and USD 1,750.00 (1 entry) received this period, nothing given yet.
const cad = summary({ grossIncomeMinor: m(520_300), netIncomeMinor: m(520_300), accruedMinor: m(52_030), outstandingMinor: m(52_030), entryCount: 2 });
const usd = summary({ currency: "USD", grossIncomeMinor: m(175_000), netIncomeMinor: m(175_000), accruedMinor: m(17_500), outstandingMinor: m(17_500), entryCount: 1 });

describe("combinedPeriodFigures", () => {
  it("combines income, tithe and given in CAD when both currencies have activity (the owner's numbers)", () => {
    const vm = combinedPeriodFigures({ CAD: cad, USD: usd }, rate, "CAD");
    expect(vm.status).toBe("combined");
    expect(vm.incomeCad).toEqual({ totalCadMinor: 767_838, cadMinor: 520_300, usdMinor: 175_000, usdInCadMinor: 247_538 });
    expect(vm.accruedCad).toEqual({ totalCadMinor: 76_784, cadMinor: 52_030, usdMinor: 17_500, usdInCadMinor: 24_754 });
    expect(vm.givenCad).toEqual({ totalCadMinor: 0, cadMinor: 0, usdMinor: 0, usdInCadMinor: 0 });
    expect(vm.rate).toEqual(rate);
  });

  it("leaves a period alone when only the selected currency has activity (no rate needed)", () => {
    expect(combinedPeriodFigures({ CAD: cad, USD: summary({ currency: "USD" }) }, rate, "CAD")).toEqual({
      status: "single_currency",
      incomeCad: null,
      accruedCad: null,
      givenCad: null,
      rate: null,
    });
    expect(combinedPeriodFigures({ CAD: summary({}), USD: usd }, null, "USD").status).toBe("single_currency");
    expect(combinedPeriodFigures({ CAD: summary({}), USD: summary({ currency: "USD" }) }, null, "CAD").status).toBe("single_currency");
  });

  it("still counts the other currency when only it has activity, so no entry is left out", () => {
    // CAD selected, USD-only period: ≈ CAD 2,475.38 with "CAD 0.00 · USD 1,750.00" (not CAD 0.00).
    const usdOnly = combinedPeriodFigures({ CAD: summary({}), USD: usd }, rate, "CAD");
    expect(usdOnly.status).toBe("combined");
    expect(usdOnly.incomeCad).toEqual({ totalCadMinor: 247_538, cadMinor: 0, usdMinor: 175_000, usdInCadMinor: 247_538 });
    expect(usdOnly.rate).toEqual(rate);
    // …and without a rate it says so instead of guessing.
    expect(combinedPeriodFigures({ CAD: summary({}), USD: usd }, null, "CAD").status).toBe("unavailable");
    // USD selected, CAD-only period: exact CAD figures, no conversion and no rate needed.
    const cadOnly = combinedPeriodFigures({ CAD: cad, USD: summary({ currency: "USD" }) }, null, "USD");
    expect(cadOnly.status).toBe("combined");
    expect(cadOnly.incomeCad).toEqual({ totalCadMinor: 520_300, cadMinor: 520_300, usdMinor: 0, usdInCadMinor: 0 });
    expect(cadOnly.rate).toBeNull();
  });

  it("is unavailable (never a guess) when both currencies are active and there is no rate", () => {
    expect(combinedPeriodFigures({ CAD: cad, USD: usd }, null, "CAD")).toEqual({
      status: "unavailable",
      incomeCad: null,
      accruedCad: null,
      givenCad: null,
      rate: null,
    });
  });

  it("handles a period whose refunds bring USD tithe below zero", () => {
    const refunded = summary({ currency: "USD", refundedMinor: m(10_000), netIncomeMinor: m(-10_000), accruedMinor: m(-1_000) });
    const vm = combinedPeriodFigures({ CAD: cad, USD: refunded }, { ...rate, value: "1.3500" }, "USD");
    expect(vm.incomeCad?.totalCadMinor).toBe(520_300 - 13_500);
    expect(vm.accruedCad?.totalCadMinor).toBe(52_030 - 1_350);
  });
});

describe("combinedStillToGiveFrom", () => {
  it("keeps the existing behaviour: CAD only without USD owed, combined with a rate, unavailable without", () => {
    expect(combinedStillToGiveFrom({ CAD: m(52_030), USD: m(0) }, rate)).toMatchObject({ status: "cad_only", totalCadMinor: 52_030, rate: null });
    expect(combinedStillToGiveFrom({ CAD: m(52_030), USD: m(17_500) }, rate)).toMatchObject({
      status: "combined",
      totalCadMinor: 76_784,
      usdInCadMinor: 24_754,
      rate,
    });
    expect(combinedStillToGiveFrom({ CAD: m(52_030), USD: m(17_500) }, null)).toMatchObject({ status: "unavailable", totalCadMinor: null });
  });
});

describe("fxRateVM", () => {
  it("labels the source", () => {
    expect(
      fxRateVM({ base: "USD", quote: "CAD", rate: "1.4145", observedOn: toLocalDate("2026-09-25"), source: "bank_of_canada", fetchedAt: "x", stale: false }),
    ).toEqual({ value: "1.4145", observedOn: "2026-09-25", sourceLabel: "Bank of Canada", stale: false });
  });
});
