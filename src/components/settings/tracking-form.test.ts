import { describe, expect, it } from "vitest";

import { toLocalDate } from "@/domain";
import type { SettingsVM } from "@/lib/view-models";

import {
  currentPeriodLabel,
  draftFromSettings,
  isTrackingDirty,
  missingDateErrors,
  trackingStartMax,
} from "./tracking-form";

const settings: SettingsVM = {
  trackingStart: toLocalDate("2026-10-03"),
  timeZone: "America/Toronto",
  displayCurrency: "CAD",
  lastEntryCurrency: "USD",
  churchName: "Grace Church",
  nextPayoutDate: toLocalDate("2026-12-31"),
  nextPayoutIsDefault: true,
  titheRateBps: 1000,
  roundingPolicy: "HALF_UP_PER_ENTRY_MINOR",
  version: 3,
};

const today = toLocalDate("2026-10-03");

describe("draftFromSettings / isTrackingDirty", () => {
  it("starts clean", () => {
    const saved = draftFromSettings(settings);
    expect(saved).toEqual({
      trackingStart: "2026-10-03",
      nextPayoutDate: "2026-12-31",
      timeZone: "America/Toronto",
      displayCurrency: "CAD",
      churchName: "Grace Church",
    });
    expect(isTrackingDirty({ ...saved }, saved)).toBe(false);
  });

  it("detects each changed field and ignores surrounding spaces in the church name", () => {
    const saved = draftFromSettings(settings);
    expect(isTrackingDirty({ ...saved, trackingStart: "2026-01-01" }, saved)).toBe(true);
    expect(isTrackingDirty({ ...saved, nextPayoutDate: "2027-01-15" }, saved)).toBe(true);
    expect(isTrackingDirty({ ...saved, timeZone: "UTC" }, saved)).toBe(true);
    expect(isTrackingDirty({ ...saved, displayCurrency: "USD" }, saved)).toBe(true);
    expect(isTrackingDirty({ ...saved, churchName: "  Grace Church " }, saved)).toBe(false);
    expect(isTrackingDirty({ ...saved, churchName: "" }, saved)).toBe(true);
  });
});

describe("trackingStartMax", () => {
  it("is today without income, otherwise the earlier of today and the earliest income", () => {
    expect(trackingStartMax(today, null)).toBe("2026-10-03");
    expect(trackingStartMax(today, toLocalDate("2026-09-15"))).toBe("2026-09-15");
    expect(trackingStartMax(today, toLocalDate("2026-10-03"))).toBe("2026-10-03");
  });
});

describe("currentPeriodLabel", () => {
  it("describes the period containing today", () => {
    expect(currentPeriodLabel(today, "2026-10-03", settings.trackingStart)).toBe("Oct 3 – Dec 31, 2026");
    expect(currentPeriodLabel(today, "2026-01-01", settings.trackingStart)).toBe("Jan 1 – Dec 31, 2026");
  });

  it("starts on Jan 1 once tracking began in an earlier year", () => {
    expect(currentPeriodLabel(today, "2025-06-01", settings.trackingStart)).toBe("Jan 1 – Dec 31, 2026");
  });

  it("falls back to the saved start while the typed date is incomplete", () => {
    expect(currentPeriodLabel(today, "", settings.trackingStart)).toBe("Oct 3 – Dec 31, 2026");
    expect(currentPeriodLabel(today, "2026-02-30", settings.trackingStart)).toBe("Oct 3 – Dec 31, 2026");
  });

  it("never shows a reversed range for a future start", () => {
    expect(currentPeriodLabel(today, "2027-03-01", settings.trackingStart)).toBe("Mar 1 – Dec 31, 2027");
  });
});

describe("missingDateErrors", () => {
  it("flags empty or impossible dates only", () => {
    const saved = draftFromSettings(settings);
    expect(missingDateErrors(saved)).toEqual({});
    expect(missingDateErrors({ ...saved, trackingStart: "", nextPayoutDate: "2026-13-01" })).toEqual({
      trackingStart: "Enter a date.",
      nextPayoutDate: "Enter a date.",
    });
  });
});
