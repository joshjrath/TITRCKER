import { describe, expect, it } from 'vitest';
import { DEFAULT_TRACKING_START } from './constants';
import { toLocalDate } from './dates';
import {
  allTimeRange,
  availablePeriodYears,
  currentPeriodYear,
  formatRangeLabel,
  periodRange,
  periodRangeForYear,
} from './periods';
import { d, income, opening, payment, snapshot } from './testFixtures';

const trackingStart = toLocalDate(DEFAULT_TRACKING_START);

describe('periodRangeForYear', () => {
  it('defaults the first period to Oct 3 – Dec 31, 2026', () => {
    expect(periodRangeForYear(2026, trackingStart)).toEqual({
      key: 2026,
      start: '2026-10-03',
      end: '2026-12-31',
      label: 'Oct 3 – Dec 31, 2026',
    });
  });

  it('uses full calendar years after the tracking start year', () => {
    expect(periodRangeForYear(2027, trackingStart)).toEqual({
      key: 2027,
      start: '2027-01-01',
      end: '2027-12-31',
      label: 'Jan 1 – Dec 31, 2027',
    });
  });

  it('supports a backdated tracking start', () => {
    expect(periodRangeForYear(2026, d('2026-01-01')).start).toBe('2026-01-01');
    expect(periodRangeForYear(2026, d('2026-01-01')).label).toBe('Jan 1 – Dec 31, 2026');
  });

  it('creates whole-year buckets before the tracking start (opening obligations only)', () => {
    expect(periodRangeForYear(2025, trackingStart)).toMatchObject({ start: '2025-01-01', end: '2025-12-31' });
  });

  it('labels cross-year ranges with both years', () => {
    expect(formatRangeLabel(d('2025-12-01'), d('2026-01-31'))).toBe('Dec 1, 2025 – Jan 31, 2026');
  });
});

describe('availablePeriodYears', () => {
  it('starts with just the tracking-start year', () => {
    expect(availablePeriodYears(trackingStart, d('2026-10-03'), snapshot())).toEqual([2026]);
  });

  it('includes 2027 after the year rolls over', () => {
    expect(availablePeriodYears(trackingStart, d('2027-01-01'), snapshot())).toEqual([2026, 2027]);
  });

  it('includes earlier years that hold opening obligations', () => {
    const snap = snapshot({ openings: [opening({ amount: '300.00', on: '2024-06-30' })] });
    expect(availablePeriodYears(trackingStart, d('2026-10-03'), snap)).toEqual([2024, 2025, 2026]);
  });

  it('includes years referenced by allocations', () => {
    const snap = snapshot({ payments: [payment({ amount: '10.00', on: '2026-10-05', allocations: [[2025, '10.00']] })] });
    expect(availablePeriodYears(trackingStart, d('2026-10-05'), snap)).toEqual([2025, 2026]);
  });

  it('reports the current period year', () => {
    expect(currentPeriodYear(d('2027-01-01'))).toBe(2027);
  });
});

describe('allTimeRange', () => {
  it('spans tracking start (or earliest record) to today (or latest record)', () => {
    const snap = snapshot({
      incomes: [income({ amount: '10.00', on: '2026-10-05' })],
      openings: [opening({ amount: '5.00', on: '2025-03-01' })],
    });
    expect(allTimeRange(trackingStart, d('2026-11-01'), snap)).toEqual({
      key: 'all',
      start: '2025-03-01',
      end: '2026-11-01',
      label: 'All time',
    });
    expect(periodRange('all', trackingStart, d('2026-11-01'), snap).key).toBe('all');
    expect(periodRange(2026, trackingStart, d('2026-11-01'), snap).start).toBe('2026-10-03');
  });
});
