import { describe, expect, it } from "vitest";
import { toMinor } from "@/domain";
import { adjustmentRemovalEffect, deleteEffectText, netSummaryText, refundPreview } from "./adjustment-effects";

const m = toMinor;
// CAD 250.00 received, CAD 25.00 tithe, nothing refunded yet.
const fresh = {
  currency: "CAD" as const,
  amountMinor: m(25000),
  titheMinor: m(2500),
  titheRateBps: 1000,
  netAmountMinor: m(25000),
  netTitheMinor: m(2500),
  refundableMinor: m(25000),
  refundedMinor: m(0),
};
// CAD 249.99 received (tithe 25.00), CAD 0.05 already refunded: net 249.94, tithe 24.99.
const partly = {
  ...fresh,
  amountMinor: m(24999),
  titheMinor: m(2500),
  netAmountMinor: m(24994),
  netTitheMinor: m(2499),
  refundableMinor: m(24994),
  refundedMinor: m(5),
};

describe("refundPreview", () => {
  it("is empty for blank input and explains invalid amounts", () => {
    expect(refundPreview(fresh, "  ").status).toBe("empty");
    const bad = refundPreview(fresh, "1,75.00");
    expect(bad.status).toBe("invalid");
  });

  it("computes the tithe change from the net amount", () => {
    const p = refundPreview(fresh, "50");
    expect(p).toEqual({
      status: "ok",
      amountMinor: 5000,
      titheChangeMinor: -500,
      netAmountAfterMinor: 20000,
      netTitheAfterMinor: 2000,
    });
  });

  it("rounds half up per entry on the remaining amount", () => {
    const p = refundPreview(partly, "0.04");
    // 249.90 -> 24.99 (24.990), so no tithe change.
    expect(p.status === "ok" && p.titheChangeMinor).toBe(0);
    const q = refundPreview(partly, "0.05");
    // 249.89 -> 24.99 (24.989 rounds to 24.99).
    expect(q.status === "ok" && q.netTitheAfterMinor).toBe(2499);
  });

  it("a full refund reverses exactly the remaining tithe", () => {
    const p = refundPreview(partly, "249.94");
    expect(p.status === "ok" && p.netTitheAfterMinor).toBe(0);
    expect(p.status === "ok" && p.titheChangeMinor).toBe(-2499);
  });

  it("refuses more than the refundable amount", () => {
    const p = refundPreview(fresh, "250.01");
    expect(p).toEqual({ status: "too_much", message: "You can refund at most CAD 250.00 on this entry." });
    expect(refundPreview({ ...fresh, refundableMinor: m(0) }, "1")).toEqual({
      status: "too_much",
      message: "This entry has already been fully refunded.",
    });
  });
});

describe("adjustmentRemovalEffect", () => {
  it("adds the refund back before computing the tithe", () => {
    expect(adjustmentRemovalEffect(partly, { amountMinor: m(5) })).toEqual({ titheChangeMinor: 1, netTitheAfterMinor: 2500 });
  });
});

describe("texts", () => {
  it("states the effect of a delete", () => {
    expect(deleteEffectText({ ...fresh, amountMinor: m(175000), netAmountMinor: m(175000), netTitheMinor: m(17500) })).toBe(
      "This removes CAD 1,750.00 income and CAD 175.00 tithe from your totals. It stays in your audit history.",
    );
    expect(deleteEffectText(partly)).toBe(
      "This removes CAD 249.94 income and CAD 24.99 tithe (after its refunds) from your totals. It stays in your audit history.",
    );
  });

  it("summarises refunded entries", () => {
    expect(netSummaryText({ ...fresh, refundedMinor: m(5000), netTitheMinor: m(2000) })).toBe(
      "Refunded CAD 50.00 · net tithe CAD 20.00",
    );
  });
});
