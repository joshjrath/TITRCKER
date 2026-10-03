/**
 * Periods: the display windows of yearly buckets (ARCHITECTURE §3.5).
 *
 * A period is `max(trackingStart, Jan 1)` to `Dec 31` of a calendar year. The default tracking
 * start 2026-10-03 makes the first period Oct 3 – Dec 31, 2026. Later years become new periods
 * automatically; years before the tracking start only exist when opening obligations are dated there.
 * A year changing never resets, erases or settles anything.
 */
import {
  endOfYear,
  formatLocalDate,
  maxLocalDate,
  minLocalDate,
  startOfYear,
  yearOf,
  type LocalDate,
} from './dates';
import type { LedgerSnapshot } from './records';

/** A calendar year, or `'all'` for all time. */
export type PeriodKey = number | 'all';

export interface PeriodRange {
  key: PeriodKey;
  start: LocalDate;
  end: LocalDate;
  /** 'Oct 3 – Dec 31, 2026', 'Jan 1 – Dec 31, 2027' or 'All time'. */
  label: string;
}

export const ALL_TIME_LABEL = 'All time';

/** Label for a date range: 'Oct 3 – Dec 31, 2026' (same year) or 'Dec 1, 2025 – Jan 31, 2026'. */
export function formatRangeLabel(start: LocalDate, end: LocalDate): string {
  if (yearOf(start) === yearOf(end)) {
    return `${formatLocalDate(start, 'short')} – ${formatLocalDate(end, 'medium')}`;
  }
  return `${formatLocalDate(start, 'medium')} – ${formatLocalDate(end, 'medium')}`;
}

/**
 * The display range of one calendar year's bucket: starts at the tracking start in the tracking
 * start's year, otherwise on Jan 1 (including years before the tracking start, whose buckets can
 * only hold opening obligations), and always ends on Dec 31.
 */
export function periodRangeForYear(year: number, trackingStart: LocalDate): PeriodRange {
  const start = year === yearOf(trackingStart) ? trackingStart : startOfYear(year);
  const end = endOfYear(year);
  return { key: year, start, end, label: formatRangeLabel(start, end) };
}

/** Every financially relevant date in the snapshot (events, payments, allocations' years excluded). */
function snapshotDates(snapshot: LedgerSnapshot): LocalDate[] {
  return [
    ...snapshot.incomes.map((r) => r.receivedOn),
    ...snapshot.adjustments.map((r) => r.effectiveOn),
    ...snapshot.openings.map((r) => r.effectiveOn),
    ...snapshot.payments.map((r) => r.paidOn),
  ];
}

/** Every bucket year referenced by any record or allocation. */
function snapshotYears(snapshot: LedgerSnapshot): number[] {
  return [
    ...snapshotDates(snapshot).map(yearOf),
    ...snapshot.payments.flatMap((p) => p.allocations.map((a) => a.bucketYear)),
  ];
}

/**
 * Selectable period years, ascending and contiguous: from the earlier of the tracking start's year
 * and the earliest record year, to the later of today's year and the latest record year
 * (so 2027 appears automatically once today is in 2027).
 */
export function availablePeriodYears(trackingStart: LocalDate, today: LocalDate, snapshot: LedgerSnapshot): number[] {
  const years = snapshotYears(snapshot);
  const first = Math.min(yearOf(trackingStart), ...years);
  const last = Math.max(yearOf(today), yearOf(trackingStart), ...years);
  const result: number[] = [];
  for (let year = first; year <= last; year += 1) result.push(year);
  return result;
}

/** The period that contains today. */
export function currentPeriodYear(today: LocalDate): number {
  return yearOf(today);
}

/**
 * The all-time range: from the earlier of the tracking start and the earliest record date, to the
 * later of today and the latest record date.
 */
export function allTimeRange(trackingStart: LocalDate, today: LocalDate, snapshot: LedgerSnapshot): PeriodRange {
  const dates = snapshotDates(snapshot);
  return {
    key: 'all',
    start: minLocalDate(trackingStart, ...dates),
    end: maxLocalDate(today, trackingStart, ...dates),
    label: ALL_TIME_LABEL,
  };
}

/** The range for any period key. */
export function periodRange(
  key: PeriodKey,
  trackingStart: LocalDate,
  today: LocalDate,
  snapshot: LedgerSnapshot,
): PeriodRange {
  return key === 'all' ? allTimeRange(trackingStart, today, snapshot) : periodRangeForYear(key, trackingStart);
}
