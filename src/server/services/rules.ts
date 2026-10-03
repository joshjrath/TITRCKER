import "server-only";

import { formatLocalDate, toLocalDate, type LocalDate } from "@/domain";

import { validationError } from "./errors";

/** Rejects a financial date after the owner's local today. */
export function assertNotFuture(date: LocalDate, today: LocalDate, field: string, what: string): void {
  if (date > today) {
    throw validationError({
      [field]: `${what} can't be in the future. Today is ${formatLocalDate(today)}.`,
    });
  }
}

/** Rejects an income date before the tracking start. */
export function assertOnOrAfterTrackingStart(date: LocalDate, trackingStart: string, field: string): void {
  const start = toLocalDate(trackingStart);
  if (date < start) {
    throw validationError({
      [field]: `Income can't be dated before your tracking start (${formatLocalDate(start)}). You can move the tracking start earlier in Settings.`,
    });
  }
}
