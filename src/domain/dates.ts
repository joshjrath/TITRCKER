/**
 * Local calendar dates (`YYYY-MM-DD`) and pure calendar arithmetic.
 *
 * Policy (ARCHITECTURE §4): financial dates are local calendar dates, never JS `Date` objects, so a
 * time zone can never move an entry into another day or year. The only place an instant meets a zone
 * is {@link todayInZone}, and it receives "now" as an argument. All other arithmetic works on
 * epoch-day integers computed with `Date.UTC`, which has no time-zone or DST behaviour.
 */
import {
  DAYS_PER_WEEK,
  EPOCH_WEEKDAY,
  FIRST_MONTH,
  LAST_DAY_OF_DECEMBER,
  LAST_MONTH,
  MAX_SUPPORTED_YEAR,
  MIN_SUPPORTED_YEAR,
  MS_PER_DAY,
} from './constants';

/** A validated local calendar date `YYYY-MM-DD` within the supported year range. */
export type LocalDate = string & { readonly __localDate: unique symbol };

/** A month key `YYYY-MM`. */
export type MonthKey = string;

const LOCAL_DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_SHAPE = /^(\d{4})-(\d{2})$/;

const MONTH_NAMES_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const MONTH_NAMES_SHORT = MONTH_NAMES_LONG.map((name) => name.slice(0, 3));
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const pad2 = (n: number): string => String(n).padStart(2, '0');
const pad4 = (n: number): string => String(n).padStart(4, '0');

/** Number of days in a month of the proleptic Gregorian calendar (handles leap years). */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this month.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Strictly parses `YYYY-MM-DD`: zero-padded, a real calendar date (2026-02-29 is invalid,
 * 2028-02-29 is valid) and a year within MIN..MAX_SUPPORTED_YEAR. Returns null otherwise.
 */
export function parseLocalDate(s: string): LocalDate | null {
  const match = LOCAL_DATE_SHAPE.exec(s);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_SUPPORTED_YEAR || year > MAX_SUPPORTED_YEAR) return null;
  if (month < FIRST_MONTH || month > LAST_MONTH) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return s as LocalDate;
}

/** Like {@link parseLocalDate} but throws `RangeError` for invalid input. */
export function toLocalDate(s: string): LocalDate {
  const parsed = parseLocalDate(s);
  if (parsed === null) throw new RangeError(`Invalid local date: ${JSON.stringify(s)}`);
  return parsed;
}

/** True when `timeZone` is an IANA zone known to this runtime's Intl data. */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    zoneFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * The local calendar date of instant `now` in `timeZone`. This is the single definition of "today":
 * e.g. 2027-01-01T03:30:00Z is still 2026-12-31 in America/Toronto.
 * @throws RangeError for an invalid instant or unknown time zone.
 */
export function todayInZone(now: Date, timeZone: string): LocalDate {
  if (Number.isNaN(now.getTime())) throw new RangeError('Invalid instant');
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Unknown time zone: ${timeZone}`);
  const parts = zoneFormatter(timeZone).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  return toLocalDate(`${pad4(part('year'))}-${pad2(part('month'))}-${pad2(part('day'))}`);
}

/** Three-way comparison of two local dates (zero-padded ISO strings sort chronologically). */
export function compareLocalDate(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Earliest of one or more dates. */
export function minLocalDate(first: LocalDate, ...rest: LocalDate[]): LocalDate {
  return rest.reduce((min, d) => (d < min ? d : min), first);
}

/** Latest of one or more dates. */
export function maxLocalDate(first: LocalDate, ...rest: LocalDate[]): LocalDate {
  return rest.reduce((max, d) => (d > max ? d : max), first);
}

function partsOf(d: LocalDate): { year: number; month: number; day: number } {
  const match = LOCAL_DATE_SHAPE.exec(d);
  if (!match) throw new RangeError(`Invalid local date: ${JSON.stringify(d)}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Days since 1970-01-01 for a local date (pure calendar arithmetic, no zone). */
export function toEpochDay(d: LocalDate): number {
  const { year, month, day } = partsOf(d);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/** The local date `epochDay` days after 1970-01-01. @throws RangeError outside the supported years. */
export function fromEpochDay(epochDay: number): LocalDate {
  if (!Number.isSafeInteger(epochDay)) throw new RangeError(`Epoch day must be an integer, got ${epochDay}`);
  const date = new Date(epochDay * MS_PER_DAY);
  return toLocalDate(`${pad4(date.getUTCFullYear())}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`);
}

/** `d + n` calendar days (n may be negative). Never affected by DST. */
export function addDays(d: LocalDate, n: number): LocalDate {
  return fromEpochDay(toEpochDay(d) + n);
}

/** `to - from` in whole calendar days (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** Calendar year of a local date. */
export function yearOf(d: LocalDate): number {
  return partsOf(d).year;
}

/** Month key `YYYY-MM` of a local date. */
export function monthKeyOf(d: LocalDate): MonthKey {
  return d.slice(0, 7);
}

/** January 1 of `year`. */
export function startOfYear(year: number): LocalDate {
  return toLocalDate(`${pad4(year)}-${pad2(FIRST_MONTH)}-01`);
}

/** December 31 of `year`. */
export function endOfYear(year: number): LocalDate {
  return toLocalDate(`${pad4(year)}-${pad2(LAST_MONTH)}-${pad2(LAST_DAY_OF_DECEMBER)}`);
}

function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const match = MONTH_KEY_SHAPE.exec(key);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  if (!match || month < FIRST_MONTH || month > LAST_MONTH) {
    throw new RangeError(`Invalid month key: ${JSON.stringify(key)}`);
  }
  return { year, month };
}

/** Inclusive list of month keys from the month of `start` to the month of `end` (empty if start > end). */
export function monthsInRange(start: LocalDate, end: LocalDate): MonthKey[] {
  const keys: MonthKey[] = [];
  if (start > end) return keys;
  let { year, month } = partsOf(start);
  const last = monthKeyOf(end);
  for (;;) {
    const key = `${pad4(year)}-${pad2(month)}`;
    keys.push(key);
    if (key >= last) return keys;
    month += 1;
    if (month > LAST_MONTH) {
      month = FIRST_MONTH;
      year += 1;
    }
  }
}

/** Day of week 0 (Sunday) .. 6 (Saturday). */
export function weekdayOf(d: LocalDate): number {
  return (((toEpochDay(d) + EPOCH_WEEKDAY) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;
}

/**
 * Formats a local date in English without any time-zone conversion, so the day never shifts:
 * `short` 'Dec 31', `medium` (default) 'Dec 31, 2026', `long` 'Thursday, December 31, 2026'.
 */
export function formatLocalDate(d: LocalDate, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const { year, month, day } = partsOf(d);
  const shortMonth = MONTH_NAMES_SHORT[month - 1];
  if (style === 'short') return `${shortMonth} ${day}`;
  if (style === 'medium') return `${shortMonth} ${day}, ${year}`;
  return `${WEEKDAY_NAMES[weekdayOf(d)]}, ${MONTH_NAMES_LONG[month - 1]} ${day}, ${year}`;
}

/** Formats a month key: `short` 'Oct', `long` (default) 'October 2026'. */
export function formatMonthKey(key: MonthKey, style: 'short' | 'long' = 'long'): string {
  const { year, month } = parseMonthKey(key);
  return style === 'short' ? (MONTH_NAMES_SHORT[month - 1] ?? key) : `${MONTH_NAMES_LONG[month - 1]} ${year}`;
}
