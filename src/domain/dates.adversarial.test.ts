/**
 * Adversarial tests for local dates and time zones (ARCHITECTURE §4): year boundaries in zones far
 * from Toronto, half-hour offsets, DST, a skipped calendar day, leap-year rules and malformed input.
 * Expectations are derived from the calendar itself (independent oracles), not from the implementation.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareLocalDate,
  daysBetween,
  daysInMonth,
  formatLocalDate,
  fromEpochDay,
  isValidTimeZone,
  monthKeyOf,
  monthsInRange,
  parseLocalDate,
  toEpochDay,
  toLocalDate,
  todayInZone,
  weekdayOf,
  yearOf,
  type LocalDate,
} from './dates';

const d = toLocalDate;
const MIN_DAY = toEpochDay(d('2000-01-01'));
const MAX_DAY = toEpochDay(d('2200-12-31'));
const anyDate = fc.integer({ min: MIN_DAY, max: MAX_DAY }).map(fromEpochDay);

/** Gregorian leap rule written out independently of the implementation. */
const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const monthLength = (y: number, m: number): number => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
const pad = (n: number, w: number): string => String(n).padStart(w, '0');

describe('todayInZone far from Toronto', () => {
  it.each<[string, string, string]>([
    // Pacific/Kiritimati is UTC+14 all year: the first place to reach a new year.
    ['2026-12-31T09:59:59Z', 'Pacific/Kiritimati', '2026-12-31'],
    ['2026-12-31T10:00:00Z', 'Pacific/Kiritimati', '2027-01-01'],
    ['2028-02-28T10:00:00Z', 'Pacific/Kiritimati', '2028-02-29'],
    ['2028-02-29T09:59:59Z', 'Pacific/Kiritimati', '2028-02-29'],
    ['2028-02-29T10:00:00Z', 'Pacific/Kiritimati', '2028-03-01'],
    // America/St_Johns: UTC-3:30 in winter (NST), UTC-2:30 in summer (NDT).
    ['2027-01-01T03:29:59Z', 'America/St_Johns', '2026-12-31'],
    ['2027-01-01T03:30:00Z', 'America/St_Johns', '2027-01-01'],
    ['2026-07-01T02:29:59Z', 'America/St_Johns', '2026-06-30'],
    ['2026-07-01T02:30:00Z', 'America/St_Johns', '2026-07-01'],
    // St_Johns DST starts 2026-03-08 02:00 local; ends 2026-11-01 02:00 local.
    ['2026-03-09T02:29:59Z', 'America/St_Johns', '2026-03-08'],
    ['2026-03-09T02:30:00Z', 'America/St_Johns', '2026-03-09'],
    ['2026-11-02T03:29:59Z', 'America/St_Johns', '2026-11-01'],
    ['2026-11-02T03:30:00Z', 'America/St_Johns', '2026-11-02'],
    // Pacific/Apia skipped 2011-12-30 entirely (UTC-10 -> UTC+14).
    ['2011-12-30T09:59:59Z', 'Pacific/Apia', '2011-12-29'],
    ['2011-12-30T10:00:00Z', 'Pacific/Apia', '2011-12-31'],
    // Pacific/Pago_Pago is UTC-11: the last place to leave a year.
    ['2027-01-01T10:59:59Z', 'Pacific/Pago_Pago', '2026-12-31'],
    ['2027-01-01T11:00:00Z', 'Pacific/Pago_Pago', '2027-01-01'],
    // Australia/Lord_Howe has a 30-minute DST shift (UTC+11 in January).
    ['2026-12-31T12:59:59Z', 'Australia/Lord_Howe', '2026-12-31'],
    ['2026-12-31T13:00:00Z', 'Australia/Lord_Howe', '2027-01-01'],
    // Asia/Kathmandu is UTC+5:45.
    ['2026-12-31T18:14:59Z', 'Asia/Kathmandu', '2026-12-31'],
    ['2026-12-31T18:15:00Z', 'Asia/Kathmandu', '2027-01-01'],
  ])('%s in %s is %s', (instant, zone, expected) => {
    expect(todayInZone(new Date(instant), zone)).toBe(expected);
  });

  it('matches a fixed-offset oracle for UTC+14 at every instant (property)', () => {
    const start = Date.UTC(2000, 0, 1);
    const end = Date.UTC(2200, 11, 30);
    const fourteenHoursMs = 14 * 60 * 60 * 1000;
    fc.assert(
      fc.property(fc.integer({ min: start, max: end }), (ms) => {
        const shifted = new Date(ms + fourteenHoursMs).toISOString().slice(0, 10);
        expect(todayInZone(new Date(ms), 'Pacific/Kiritimati')).toBe(shifted);
        expect(todayInZone(new Date(ms), 'UTC')).toBe(new Date(ms).toISOString().slice(0, 10));
      }),
    );
  });

  it('never moves Toronto backwards in time and stays within a day of UTC (property)', () => {
    const start = Date.UTC(2000, 0, 2);
    const end = Date.UTC(2200, 11, 27);
    fc.assert(
      fc.property(fc.integer({ min: start, max: end }), fc.integer({ min: 0, max: 3 * 86_400_000 }), (ms, step) => {
        const a = todayInZone(new Date(ms), 'America/Toronto');
        const b = todayInZone(new Date(ms + step), 'America/Toronto');
        expect(compareLocalDate(a, b)).toBeLessThanOrEqual(0);
        const utc = todayInZone(new Date(ms), 'UTC');
        expect([0, -1]).toContain(daysBetween(utc, a));
      }),
    );
  });

  it('rejects instants whose local date leaves the supported years', () => {
    expect(() => todayInZone(new Date('1999-12-31T12:00:00Z'), 'UTC')).toThrow(RangeError);
    expect(todayInZone(new Date('1999-12-31T12:00:00Z'), 'Pacific/Kiritimati')).toBe('2000-01-01');
  });
});

describe('isValidTimeZone accepts IANA zones only', () => {
  it.each(['America/Toronto', 'America/St_Johns', 'Pacific/Kiritimati', 'UTC', 'Asia/Kathmandu'])('accepts %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it.each(['+05:00', '-05:00', '+14:00', '−05:00', ' UTC', 'UTC ', '   ', 'Mars/Olympus', 'America/Toronto/Extra'])(
    'rejects %j',
    (zone) => {
      expect(isValidTimeZone(zone)).toBe(false);
      expect(() => todayInZone(new Date('2026-10-03T12:00:00Z'), zone)).toThrow(RangeError);
    },
  );
});

describe('strict local-date parsing (properties)', () => {
  it('accepts exactly the real calendar dates of 2000–2200', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1990, max: 2210 }), fc.integer({ min: 0, max: 13 }), fc.integer({ min: 0, max: 32 }), (y, m, day) => {
        const s = `${pad(y, 4)}-${pad(m, 2)}-${pad(day, 2)}`;
        const valid = y >= 2000 && y <= 2200 && m >= 1 && m <= 12 && day >= 1 && day <= monthLength(y, m);
        expect(parseLocalDate(s)).toBe(valid ? s : null);
      }),
    );
  });

  it('applies the century leap rule', () => {
    expect(parseLocalDate('2000-02-29')).toBe('2000-02-29');
    expect(parseLocalDate('2096-02-29')).toBe('2096-02-29');
    expect(parseLocalDate('2100-02-29')).toBeNull();
    expect(parseLocalDate('2200-02-29')).toBeNull();
  });

  it.each([
    '2026-10-03\n',
    '\n2026-10-03',
    '2026-10-03 ',
    '+2026-10-03',
    '02026-10-03',
    '2026-10-3',
    '2026-1-03',
    '2026-10-03T00:00',
    '2026-W40-6',
    '2026-276',
    '20261003',
    '2026-10-٠٣',
    '2026–10–03',
    'NaN-NaN-NaN',
  ])('rejects %j', (s) => {
    expect(parseLocalDate(s)).toBeNull();
  });

  it('daysInMonth knows that year 0 and 2000 are leap years but 1900 and 2100 are not', () => {
    expect([0, 1900, 2000, 2100].map((y) => daysInMonth(y, 2))).toEqual([29, 28, 29, 28]);
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError);
  });

  it('daysInMonth follows the proleptic Gregorian calendar for every year, including two-digit years', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 1, max: 12 }), (y, m) => {
        expect(daysInMonth(y, m)).toBe(monthLength(y, m));
      }),
    );
  });
});

describe('epoch-day arithmetic (properties)', () => {
  it('daysBetween agrees with compareLocalDate and addDays inverts it', () => {
    fc.assert(
      fc.property(anyDate, anyDate, (a, b) => {
        const diff = daysBetween(a, b);
        expect(Math.sign(diff) + compareLocalDate(a, b)).toBe(0);
        expect(addDays(a, diff)).toBe(b);
        expect(daysBetween(b, a) + diff).toBe(0);
      }),
    );
  });

  it('adding one day walks the calendar exactly (month and year roll-over, leap days)', () => {
    fc.assert(
      fc.property(fc.integer({ min: MIN_DAY, max: MAX_DAY - 1 }), (day) => {
        const date = fromEpochDay(day);
        const [y, m, dd] = date.split('-').map(Number) as [number, number, number];
        let ny = y;
        let nm = m;
        let nd = dd + 1;
        if (nd > monthLength(y, m)) {
          nd = 1;
          nm += 1;
          if (nm > 12) {
            nm = 1;
            ny += 1;
          }
        }
        expect(addDays(date, 1)).toBe(`${pad(ny, 4)}-${pad(nm, 2)}-${pad(nd, 2)}`);
      }),
    );
  });

  it('weekdays and long formatting agree with the UTC calendar', () => {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    fc.assert(
      fc.property(anyDate, (date) => {
        const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
        expect(weekdayOf(date)).toBe(weekday);
        expect(formatLocalDate(date, 'long').startsWith(`${names[weekday]},`)).toBe(true);
        expect(formatLocalDate(date, 'medium').endsWith(`, ${yearOf(date)}`)).toBe(true);
      }),
    );
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, -Number.MAX_VALUE])('addDays rejects a non-integer offset %s', (n) => {
    expect(() => addDays(d('2026-10-03'), n)).toThrow(RangeError);
  });

  it('crosses the supported range edges only from the inside', () => {
    expect(addDays(d('2000-01-01'), 0)).toBe('2000-01-01');
    expect(() => addDays(d('2000-01-01'), -1)).toThrow(RangeError);
    expect(addDays(d('2200-12-30'), 1)).toBe('2200-12-31');
  });
});

describe('monthsInRange (property)', () => {
  it('lists every month once, consecutively, from the start month to the end month', () => {
    fc.assert(
      fc.property(anyDate, fc.integer({ min: 0, max: 800 }), (start: LocalDate, span) => {
        const end = fromEpochDay(Math.min(MAX_DAY, toEpochDay(start) + span));
        const months = monthsInRange(start, end);
        const [sy, sm] = start.split('-').map(Number) as [number, number];
        const [ey, em] = end.split('-').map(Number) as [number, number];
        expect(months).toHaveLength((ey - sy) * 12 + (em - sm) + 1);
        expect(months[0]).toBe(monthKeyOf(start));
        expect(months.at(-1)).toBe(monthKeyOf(end));
        expect(new Set(months).size).toBe(months.length);
        for (let i = 1; i < months.length; i += 1) expect((months[i] ?? '') > (months[i - 1] ?? '')).toBe(true);
      }),
    );
  });
});
