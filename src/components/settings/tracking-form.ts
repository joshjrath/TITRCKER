import {
  MIN_SUPPORTED_YEAR,
  minLocalDate,
  parseLocalDate,
  periodRangeForYear,
  yearOf,
  type Currency,
  type LocalDate,
} from "@/domain";
import type { SettingsVM } from "@/lib/view-models";

/** The editable part of the settings, as the form holds it (dates as typed in the native date inputs). */
export interface TrackingDraft {
  trackingStart: string;
  nextPayoutDate: string;
  timeZone: string;
  displayCurrency: Currency;
  churchName: string;
}

export type TrackingField = keyof TrackingDraft;

export function draftFromSettings(settings: SettingsVM): TrackingDraft {
  return {
    trackingStart: settings.trackingStart,
    nextPayoutDate: settings.nextPayoutDate,
    timeZone: settings.timeZone,
    displayCurrency: settings.displayCurrency,
    churchName: settings.churchName,
  };
}

/** True when any field differs from the saved values (church name compared trimmed, as the server stores it). */
export function isTrackingDirty(draft: TrackingDraft, saved: TrackingDraft): boolean {
  return (
    draft.trackingStart !== saved.trackingStart ||
    draft.nextPayoutDate !== saved.nextPayoutDate ||
    draft.timeZone !== saved.timeZone ||
    draft.displayCurrency !== saved.displayCurrency ||
    draft.churchName.trim() !== saved.churchName.trim()
  );
}

/** Earliest selectable date in any date input. */
export const MIN_DATE: LocalDate = `${MIN_SUPPORTED_YEAR}-01-01`;

/**
 * Bounds for the tracking start input: never after today, and never after the earliest recorded income
 * (income can't predate the tracking start). The server enforces the same rules and words the errors.
 */
export function trackingStartMax(today: LocalDate, earliestIncomeDate: LocalDate | null): LocalDate {
  return earliestIncomeDate === null ? today : minLocalDate(today, earliestIncomeDate);
}

/**
 * The period that contains today, for a (possibly half-typed) tracking start. Falls back to the saved
 * tracking start while the typed one is not a real date: "Oct 3 – Dec 31, 2026".
 */
export function currentPeriodLabel(today: LocalDate, typedTrackingStart: string, savedTrackingStart: LocalDate): string {
  const start = parseLocalDate(typedTrackingStart) ?? savedTrackingStart;
  // A tracking start after today is rejected on save; show the period it would start instead of a reversed range.
  const year = Math.max(yearOf(today), yearOf(start));
  return periodRangeForYear(year, start).label;
}

/** Early, purely structural feedback (empty dates). Every business rule is checked and worded by the server. */
export function missingDateErrors(draft: TrackingDraft): Partial<Record<TrackingField, string>> {
  const errors: Partial<Record<TrackingField, string>> = {};
  if (parseLocalDate(draft.trackingStart) === null) errors.trackingStart = "Enter a date.";
  if (parseLocalDate(draft.nextPayoutDate) === null) errors.nextPayoutDate = "Enter a date.";
  return errors;
}
