import { describe, expect, it } from "vitest";

import type { CombinedTotalVM } from "@/lib/view-models";

import { combinedOneLiner, rateLine, spokenCombined } from "./combined-text";

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
