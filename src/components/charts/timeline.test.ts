import { describe, expect, it } from 'vitest';
import { dateFraction, dayOffset, describeRemaining, describeTimeline, monthBoundaries, monthSegments } from './timeline';

describe('dateFraction', () => {
  it('positions a date by calendar day and clamps', () => {
    expect(dateFraction('2026-10-03', '2026-10-03', '2026-12-31')).toBe(0);
    expect(dateFraction('2026-12-31', '2026-10-03', '2026-12-31')).toBe(1);
    expect(dateFraction('2026-11-01', '2026-10-03', '2026-12-31')).toBeCloseTo(29 / 89);
    expect(dateFraction('2027-02-01', '2026-10-03', '2026-12-31')).toBe(1);
    expect(dateFraction('2026-01-01', '2026-10-03', '2026-12-31')).toBe(0);
  });

  it('puts everything at 1 for a zero-length range', () => {
    expect(dateFraction('2026-12-31', '2026-12-31', '2026-12-31')).toBe(1);
  });

  it('dayOffset is unclamped', () => {
    expect(dayOffset('2026-10-01', '2026-10-03')).toBe(-2);
  });
});

describe('monthSegments', () => {
  it('splits a partial first month and full later months', () => {
    const segs = monthSegments('2026-10-03', '2026-12-31');
    expect(segs.map((s) => s.label)).toEqual(['Oct', 'Nov', 'Dec']);
    expect(segs.map((s) => s.narrowLabel)).toEqual(['O', 'N', 'D']);
    expect(segs[0]!.start).toBe(0);
    expect(segs[0]!.end).toBeCloseTo(29 / 89);
    expect(segs[1]!.start).toBeCloseTo(29 / 89);
    expect(segs[2]!.end).toBe(1);
    expect(segs[1]!.longLabel).toBe('November 2026');
    expect(monthBoundaries(segs)).toHaveLength(2);
  });

  it('suffixes the year when a range spans years', () => {
    const segs = monthSegments('2026-11-15', '2027-01-31');
    expect(segs.map((s) => s.label)).toEqual(['Nov ’26', 'Dec ’26', 'Jan ’27']);
  });

  it('covers a full calendar year with 12 contiguous segments', () => {
    const segs = monthSegments('2027-01-01', '2027-12-31');
    expect(segs).toHaveLength(12);
    for (let i = 1; i < segs.length; i += 1) expect(segs[i]!.start).toBe(segs[i - 1]!.end);
  });
});

describe('describeTimeline', () => {
  it('reads like the brief', () => {
    expect(
      describeTimeline({ start: '2026-10-03', end: '2026-12-31', today: '2026-10-03', payoutDate: '2026-12-31' }),
    ).toBe('Oct 3 to Dec 31, 2026; today is Oct 3; 89 days remaining');
  });

  it('describes due and overdue payouts', () => {
    expect(describeRemaining('2026-12-31', '2026-12-31')).toBe('payout is today');
    expect(describeRemaining('2026-12-30', '2026-12-31')).toBe('1 day remaining');
    expect(describeRemaining('2027-01-03', '2026-12-31')).toBe('payout was 3 days ago');
  });

  it('includes years when the range spans years', () => {
    expect(
      describeTimeline({ start: '2026-12-01', end: '2027-01-31', today: '2026-12-15', payoutDate: '2027-01-31' }),
    ).toBe('Dec 1, 2026 to Jan 31, 2027; today is Dec 15, 2026; 47 days remaining');
  });
});
