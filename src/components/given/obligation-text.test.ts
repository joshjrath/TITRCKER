import { describe, expect, it } from "vitest";
import { toMinor } from "@/domain";
import { overCoveredNote } from "./obligation-text";

describe("overCoveredNote", () => {
  it("credits payments only when the period has allocations", () => {
    expect(overCoveredNote({ year: 2026, allocatedMinor: toMinor(5_000), overCoveredMinor: toMinor(2_500) }, "CAD")).toBe(
      "2026: payments cover CAD 25.00 more than this period finally owed (after refunds). That amount counts as credit.",
    );
  });

  it("says refunds took the period below zero when nothing was allocated", () => {
    expect(overCoveredNote({ year: 2027, allocatedMinor: toMinor(0), overCoveredMinor: toMinor(1_250) }, "USD")).toBe(
      "2027: refunds brought this period below zero — USD 12.50 counts as credit.",
    );
  });
});
