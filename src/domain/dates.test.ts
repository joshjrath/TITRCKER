import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareLocalDate,
  daysBetween,
  daysInMonth,
  endOfYear,
  formatLocalDate,
  formatMonthKey,
  fromEpochDay,
  isValidTimeZone,
  maxLocalDate,
  minLocalDate,
  monthKeyOf,
  monthsInRange,
  parseLocalDate,
  startOfYear,
  toEpochDay,
  toLocalDate,
  todayInZone,
  weekdayOf,
  yearOf,
} from './dates';

const d = toLocalDate;
const TORONTO = 'America/Toronto';

describe('parseLocalDate (strict)', () => {
  it.each(['2026-10-03', '2028-02-29', '2000-01-01', '2200-12-31', '2026-12-31', '2024-02-29'])('accepts %s', (s) => {
    expect(parseLocalDate(s)).toBe(s);
  });

  it.each([
    '2026-02-29',
    '2100-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-10-00',
    '2026-1-3',
    '26-10-03',
    '2026/10/03',
    '2026-10-03T00:00:00Z',
    ' 2026-10-03',
    '1999-12-31',
    '2201-01-01',
    '',
    '２０２６-10-03',
  ])('rejects %j', (s) => {
    expect(parseLocalDate(s)).toBeNull();
    expect(() => toLocalDate(s)).toThrow(RangeError);
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('todayInZone', () => {
  it.each<[string, string]>([
    // around the year boundary
    ['2027-01-01T03:30:00Z', '2026-12-31'],
    ['2027-01-01T04:59:59Z', '2026-12-31'],
    ['2027-01-01T05:00:00Z', '2027-01-01'],
    ['2026-12-31T23:59:59Z', '2026-12-31'],
    // around midnight on the brief date (EDT, UTC-4)
    ['2026-10-03T03:59:59Z', '2026-10-02'],
    ['2026-10-03T04:00:00Z', '2026-10-03'],
    // DST starts 2026-03-08 02:00 EST -> 03:00 EDT
    ['2026-03-08T04:59:59Z', '2026-03-07'],
    ['2026-03-08T05:00:00Z', '2026-03-08'],
    ['2026-03-08T07:30:00Z', '2026-03-08'],
    ['2026-03-09T03:59:59Z', '2026-03-08'],
    ['2026-03-09T04:00:00Z', '2026-03-09'],
    // DST ends 2026-11-01 02:00 EDT -> 01:00 EST
    ['2026-11-01T03:59:59Z', '2026-10-31'],
    ['2026-11-01T04:00:00Z', '2026-11-01'],
    ['2026-11-01T06:30:00Z', '2026-11-01'],
    ['2026-11-02T04:59:59Z', '2026-11-01'],
    ['2026-11-02T05:00:00Z', '2026-11-02'],
  ])('%s is %s in America/Toronto', (instant, expected) => {
    expect(todayInZone(new Date(instant), TORONTO)).toBe(expected);
  });

  it('uses the given zone', () => {
    const instant = new Date('2027-01-01T03:30:00Z');
    expect(todayInZone(instant, 'UTC')).toBe('2027-01-01');
    expect(todayInZone(instant, 'Asia/Tokyo')).toBe('2027-01-01');
    expect(todayInZone(instant, 'America/Vancouver')).toBe('2026-12-31');
  });

  it('rejects invalid zones and instants', () => {
    expect(() => todayInZone(new Date('2026-10-03T12:00:00Z'), 'Mars/Olympus')).toThrow(RangeError);
    expect(() => todayInZone(new Date('nope'), TORONTO)).toThrow(RangeError);
  });

  it('validates time zones', () => {
    expect(isValidTimeZone(TORONTO)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('calendar arithmetic', () => {
  it('counts days to the default payout', () => {
    expect(daysBetween(d('2026-10-03'), d('2026-12-31'))).toBe(89);
    expect(daysBetween(d('2026-12-30'), d('2026-12-31'))).toBe(1);
    expect(daysBetween(d('2026-12-31'), d('2026-10-03'))).toBe(-89);
  });

  it('is unaffected by DST transitions', () => {
    expect(daysBetween(d('2026-03-07'), d('2026-03-09'))).toBe(2);
    expect(daysBetween(d('2026-10-31'), d('2026-11-02'))).toBe(2);
    expect(addDays(d('2026-03-07'), 1)).toBe('2026-03-08');
    expect(addDays(d('2026-03-08'), 1)).toBe('2026-03-09');
    expect(addDays(d('2026-11-01'), 1)).toBe('2026-11-02');
  });

  it('handles leap years', () => {
    expect(daysBetween(d('2028-02-28'), d('2028-03-01'))).toBe(2);
    expect(daysBetween(d('2026-02-28'), d('2026-03-01'))).toBe(1);
    expect(daysBetween(d('2028-01-01'), d('2029-01-01'))).toBe(366);
    expect(daysBetween(d('2026-01-01'), d('2027-01-01'))).toBe(365);
    expect(addDays(d('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(d('2027-01-01'), -1)).toBe('2026-12-31');
  });

  it('round-trips epoch days (property)', () => {
    const min = toEpochDay(d('2000-01-01'));
    const max = toEpochDay(d('2200-12-31'));
    fc.assert(
      fc.property(fc.integer({ min, max }), fc.integer({ min: -400, max: 400 }), (day, delta) => {
        const date = fromEpochDay(day);
        expect(toEpochDay(date)).toBe(day);
        const target = day + delta;
        if (target >= min && target <= max) expect(daysBetween(date, addDays(date, delta))).toBe(delta);
      }),
    );
  });

  it('rejects results outside the supported range', () => {
    expect(() => addDays(d('2200-12-31'), 1)).toThrow(RangeError);
  });

  it('compares, picks min/max and extracts parts', () => {
    expect(compareLocalDate(d('2026-10-03'), d('2026-12-31'))).toBe(-1);
    expect(compareLocalDate(d('2026-12-31'), d('2026-12-31'))).toBe(0);
    expect(compareLocalDate(d('2027-01-01'), d('2026-12-31'))).toBe(1);
    expect(minLocalDate(d('2026-10-03'), d('2026-01-01'), d('2027-01-01'))).toBe('2026-01-01');
    expect(maxLocalDate(d('2026-10-03'), d('2026-01-01'), d('2027-01-01'))).toBe('2027-01-01');
    expect(yearOf(d('2026-10-03'))).toBe(2026);
    expect(monthKeyOf(d('2026-10-03'))).toBe('2026-10');
    expect(startOfYear(2027)).toBe('2027-01-01');
    expect(endOfYear(2026)).toBe('2026-12-31');
    expect(weekdayOf(d('2026-12-31'))).toBe(4);
  });

  it('lists months inclusively', () => {
    expect(monthsInRange(d('2026-10-03'), d('2026-12-31'))).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(monthsInRange(d('2026-11-15'), d('2027-02-01'))).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(monthsInRange(d('2026-10-03'), d('2026-10-03'))).toEqual(['2026-10']);
    expect(monthsInRange(d('2026-12-31'), d('2026-10-03'))).toEqual([]);
  });
});

describe('formatting never shifts the day', () => {
  it('formats in three styles', () => {
    expect(formatLocalDate(d('2026-12-31'))).toBe('Dec 31, 2026');
    expect(formatLocalDate(d('2026-12-31'), 'short')).toBe('Dec 31');
    expect(formatLocalDate(d('2026-12-31'), 'long')).toBe('Thursday, December 31, 2026');
    expect(formatLocalDate(d('2026-10-03'), 'long')).toBe('Saturday, October 3, 2026');
    expect(formatLocalDate(d('2027-01-01'))).toBe('Jan 1, 2027');
    expect(formatLocalDate(d('2026-01-01'), 'medium')).toBe('Jan 1, 2026');
  });

  it('formats month keys', () => {
    expect(formatMonthKey('2026-10', 'short')).toBe('Oct');
    expect(formatMonthKey('2026-10', 'long')).toBe('October 2026');
    expect(formatMonthKey('2026-10')).toBe('October 2026');
    expect(() => formatMonthKey('2026-13')).toThrow(RangeError);
  });
});
