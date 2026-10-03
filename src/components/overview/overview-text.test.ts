import { describe, expect, it } from "vitest";
import { toLocalDate, toMinor, type BucketPosition, type PeriodSummary } from "@/domain";
import type { CurrencyHeadlineVM } from "@/lib/view-models";
import { balanceNotes, monthlyGivenNote, overviewHref, payoutReviewHref, payoutWindow, periodStatNotes } from "./overview-text";

const m = toMinor;
const range = { key: 2026, start: toLocalDate("2026-10-03"), end: toLocalDate("2026-12-31"), label: "Oct 3 – Dec 31, 2026" } as const;

function headline(over: Partial<CurrencyHeadlineVM> = {}): CurrencyHeadlineVM {
  return {
    currency: "CAD",
    stillToGiveMinor: m(15_000),
    creditMinor: m(0),
    accruedMinor: m(20_000),
    paidMinor: m(5_000),
    netIncomeMinor: m(199_999),
    setAsideMinor: m(0),
    stillToSetAsideMinor: m(15_000),
    carriedOverMinor: m(0),
    hasActivity: true,
    ...over,
  };
}

function bucket(year: number, over: Partial<BucketPosition> = {}): BucketPosition {
  return {
    currency: "CAD",
    year,
    range: { ...range, key: year },
    grossIncomeMinor: m(0),
    refundedMinor: m(0),
    netIncomeMinor: m(0),
    incomeTitheMinor: m(0),
    adjustmentTitheMinor: m(0),
    openingMinor: m(0),
    accruedMinor: m(0),
    allocatedMinor: m(0),
    creditAppliedMinor: m(0),
    overCoveredMinor: m(0),
    outstandingMinor: m(0),
    ...over,
  };
}

describe("overview links", () => {
  it("builds the overview and payout review URLs", () => {
    expect(overviewHref({ period: "2026", currency: "USD" })).toBe("/?period=2026&currency=USD");
    expect(overviewHref({})).toBe("/");
    expect(payoutReviewHref("CAD")).toBe("/given?review=payout&currency=CAD");
  });
});

describe("balanceNotes", () => {
  it("is empty for a plain balance", () => {
    expect(balanceNotes(headline(), [], 2027)).toEqual([]);
  });

  it("names the single year money was carried over from, shows credit and set aside", () => {
    const notes = balanceNotes(
      headline({ carriedOverMinor: m(4_000), creditMinor: m(2_000), setAsideMinor: m(10_000), stillToSetAsideMinor: m(5_000) }),
      [bucket(2026, { outstandingMinor: m(4_000) }), bucket(2027, { outstandingMinor: m(11_000) })],
      2027,
    );
    expect(notes.map((n) => n.text)).toEqual([
      "Includes CAD 40.00 carried over from 2026",
      "Credit CAD 20.00 — applied to future tithe",
      "Set aside CAD 100.00 · still to set aside CAD 50.00",
    ]);
  });

  it("says earlier years when several periods are carried over", () => {
    const notes = balanceNotes(
      headline({ carriedOverMinor: m(5_000) }),
      [bucket(2026, { outstandingMinor: m(1_000) }), bucket(2027, { outstandingMinor: m(4_000) })],
      2028,
    );
    expect(notes[0]?.text).toBe("Includes CAD 50.00 carried over from earlier years");
  });
});

describe("periodStatNotes", () => {
  const summary: PeriodSummary = {
    currency: "CAD",
    range,
    grossIncomeMinor: m(200_000),
    refundedMinor: m(0),
    netIncomeMinor: m(200_000),
    accruedMinor: m(20_000),
    openingMinor: m(0),
    givenMinor: m(0),
    creditAppliedMinor: m(0),
    outstandingMinor: m(20_000),
    entryCount: 1,
  };

  it("counts entries", () => {
    expect(periodStatNotes(summary, undefined)).toEqual({ income: "1 entry" });
  });

  it("notes refunds, opening balance and refund-driven over-coverage as credit", () => {
    const notes = periodStatNotes(
      { ...summary, refundedMinor: m(2_000), openingMinor: m(4_000), entryCount: 3 },
      bucket(2026, { overCoveredMinor: m(2_500), allocatedMinor: m(5_000) }),
    );
    expect(notes).toEqual({
      income: "3 entries · after CAD 20.00 in refunds",
      accrued: "Includes CAD 40.00 opening balance",
      given: "CAD 25.00 beyond this period's tithe (after refunds) counts as credit",
    });
  });

  it("does not credit payments when nothing was allocated: refunds alone took the period below zero", () => {
    const notes = periodStatNotes(
      { ...summary, accruedMinor: m(-1_000), refundedMinor: m(10_000) },
      bucket(2027, { accruedMinor: m(-1_000), overCoveredMinor: m(1_000), allocatedMinor: m(0) }),
    );
    expect(notes.given).toBeUndefined();
    expect(notes.accrued).toBe("Refunds brought this period below zero — CAD 10.00 counts as credit");
    const withOpening = periodStatNotes({ ...summary, openingMinor: m(500) }, bucket(2027, { overCoveredMinor: m(1_000) }));
    expect(withOpening.accrued).toBe("Includes CAD 5.00 opening balance · Refunds brought this period below zero — CAD 10.00 counts as credit");
  });
});

describe("monthlyGivenNote", () => {
  it("explains what the Given column counts for a year and for all time", () => {
    expect(monthlyGivenNote(2026)).toBe(
      "Given counts payments allocated to this period, by the date they were made — the same as Given above.",
    );
    expect(monthlyGivenNote("all")).toBe("Given counts every payment, by the date it was made.");
  });
});

describe("payoutWindow", () => {
  const d = toLocalDate;
  it("describes the payout's period regardless of the selected one", () => {
    expect(payoutWindow(d("2026-12-31"), d("2026-10-03"), d("2026-10-03"))).toEqual({
      start: "2026-10-03",
      end: "2026-12-31",
      today: "2026-10-03",
      fraction: 0,
    });
    expect(payoutWindow(d("2027-12-31"), d("2026-10-03"), d("2027-07-02")).start).toBe("2027-01-01");
  });
  it("clamps after the payout date and handles a payout on the first day", () => {
    expect(payoutWindow(d("2026-12-31"), d("2026-10-03"), d("2027-01-05")).fraction).toBe(1);
    expect(payoutWindow(d("2026-10-03"), d("2026-10-03"), d("2026-10-03")).fraction).toBe(1);
  });
});
