/**
 * Calendar geometry for period visuals: where a date falls between a start and an end, and how the
 * months of a range divide it. Calendar-day arithmetic only (domain dates), never the clock.
 */
import {
  daysBetween,
  formatLocalDate,
  formatMonthKey,
  monthsInRange,
  toLocalDate,
  yearOf,
  type LocalDate,
} from '@/domain';
import { clamp01 } from './geometry';

export interface MonthSegment {
  /** 'YYYY-MM' */
  key: string;
  /** 'Oct' (with a 2-digit year suffix when the range spans years: "Jan '27"). */
  label: string;
  /** Single-letter label for narrow layouts: 'O'. */
  narrowLabel: string;
  /** Full name for assistive text: 'October 2026'. */
  longLabel: string;
  /** Fractions of the range (0..1). */
  start: number;
  end: number;
  center: number;
}

/**
 * Position of `date` between `start` (0) and `end` (1), by calendar day, clamped to [0, 1].
 * A zero-length range puts every date at 1.
 */
export function dateFraction(date: string, start: string, end: string): number {
  const total = daysBetween(toLocalDate(start), toLocalDate(end));
  if (total <= 0) return 1;
  return clamp01(daysBetween(toLocalDate(start), toLocalDate(date)) / total);
}

/** Unclamped day offset of `date` from `start` (negative before, > total after). */
export function dayOffset(date: string, start: string): number {
  return daysBetween(toLocalDate(start), toLocalDate(date));
}

/**
 * The months of [start, end] as contiguous segments: boundaries fall on the first of each month,
 * the first and last segments are clipped to the range.
 */
export function monthSegments(start: string, end: string): MonthSegment[] {
  const s = toLocalDate(start);
  const e = toLocalDate(end);
  const keys = monthsInRange(s, e);
  const multiYear = yearOf(s) !== yearOf(e);
  return keys.map((key, i) => {
    const segStart = i === 0 ? 0 : dateFraction(`${key}-01`, s, e);
    const nextKey = keys[i + 1];
    const segEnd = nextKey ? dateFraction(`${nextKey}-01`, s, e) : 1;
    const short = formatMonthKey(key, 'short');
    return {
      key,
      label: multiYear ? `${short} ’${key.slice(2, 4)}` : short,
      narrowLabel: short.slice(0, 1),
      longLabel: formatMonthKey(key, 'long'),
      start: segStart,
      end: segEnd,
      center: (segStart + segEnd) / 2,
    };
  });
}

/** Fractions where a new month begins (excluding 0 and 1). */
export function monthBoundaries(segments: readonly MonthSegment[]): number[] {
  return segments.slice(1).map((m) => m.start).filter((f) => f > 0 && f < 1);
}

function formatRange(start: LocalDate, end: LocalDate): string {
  return yearOf(start) === yearOf(end)
    ? `${formatLocalDate(start, 'short')} to ${formatLocalDate(end, 'medium')}`
    : `${formatLocalDate(start, 'medium')} to ${formatLocalDate(end, 'medium')}`;
}

/** "89 days remaining", "1 day remaining", "payout is today", "payout was 3 days ago". */
export function describeRemaining(today: string, payoutDate: string): string {
  const days = daysBetween(toLocalDate(today), toLocalDate(payoutDate));
  if (days === 0) return 'payout is today';
  if (days < 0) return `payout was ${-days} ${-days === 1 ? 'day' : 'days'} ago`;
  return `${days} ${days === 1 ? 'day' : 'days'} remaining`;
}

/**
 * Text equivalent of a period timeline:
 * "Oct 3 to Dec 31, 2026; today is Oct 3; 89 days remaining".
 */
export function describeTimeline(input: { start: string; end: string; today: string; payoutDate: string }): string {
  const start = toLocalDate(input.start);
  const end = toLocalDate(input.end);
  const today = toLocalDate(input.today);
  const todayText = yearOf(today) === yearOf(end) ? formatLocalDate(today, 'short') : formatLocalDate(today, 'medium');
  return `${formatRange(start, end)}; today is ${todayText}; ${describeRemaining(input.today, input.payoutDate)}`;
}
