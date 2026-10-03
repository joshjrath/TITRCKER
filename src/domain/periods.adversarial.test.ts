/**
 * Adversarial tests for periods (ARCHITECTURE §3.5): backdated tracking starts, years before the
 * tracking start, rollover after Dec 31 with unpaid balances, and very large ledgers.
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';
import { carriedOverMinor, computeBalances } from './balances';
import { fromEpochDay, toEpochDay, yearOf, type LocalDate } from './dates';
import { allTimeRange, availablePeriodYears, currentPeriodYear, periodRangeForYear } from './periods';
import type { LedgerSnapshot } from './records';
import { d, income, m, opening, payment, resetFixtureSequence, snapshot } from './testFixtures';

beforeEach(() => resetFixtureSequence());

const dateBetween = (min: string, max: string) =>
  fc.integer({ min: toEpochDay(d(min)), max: toEpochDay(d(max)) }).map(fromEpochDay);

describe('periodRangeForYear', () => {
  it('a period is max(tracking start, Jan 1) .. Dec 31 for the tracking year and every later year (property)', () => {
    fc.assert(
      fc.property(dateBetween('2001-01-01', '2190-12-31'), fc.integer({ min: 0, max: 9 }), (trackingStart, offset) => {
        const year = yearOf(trackingStart) + offset;
        const range = periodRangeForYear(year, trackingStart);
        const jan1 = `${year}-01-01` as LocalDate;
        expect(range.start).toBe(trackingStart > jan1 ? trackingStart : jan1);
        expect(range.end).toBe(`${year}-12-31`);
        expect(range.key).toBe(year);
        expect(range.start <= range.end).toBe(true);
      }),
    );
  });

  it('years before the tracking start are whole calendar years (they only hold opening obligations)', () => {
    fc.assert(
      fc.property(dateBetween('2010-01-01', '2190-12-31'), fc.integer({ min: 1, max: 9 }), (trackingStart, back) => {
        const year = yearOf(trackingStart) - back;
        expect(periodRangeForYear(year, trackingStart)).toMatchObject({ start: `${year}-01-01`, end: `${year}-12-31` });
      }),
    );
  });

  it.each<[string, number, string]>([
    ['2026-12-31', 2026, 'Dec 31 – Dec 31, 2026'],
    ['2026-01-01', 2026, 'Jan 1 – Dec 31, 2026'],
    ['2028-02-29', 2028, 'Feb 29 – Dec 31, 2028'],
    ['2026-10-03', 2025, 'Jan 1 – Dec 31, 2025'],
  ])('tracking start %s, year %i -> %s', (start, year, label) => {
    expect(periodRangeForYear(year, d(start)).label).toBe(label);
  });

  it('rejects years outside the supported range and fractional years', () => {
    expect(() => periodRangeForYear(1999, d('2026-10-03'))).toThrow(RangeError);
    expect(() => periodRangeForYear(2201, d('2026-10-03'))).toThrow(RangeError);
    expect(() => periodRangeForYear(2026.5, d('2026-10-03'))).toThrow(RangeError);
  });
});

describe('availablePeriodYears', () => {
  const recordsArb = fc.array(
    fc.oneof(
      dateBetween('2026-01-01', '2029-12-31').map((on) => ({ kind: 'income' as const, on })),
      dateBetween('2020-01-01', '2029-12-31').map((on) => ({ kind: 'opening' as const, on })),
      fc.tuple(dateBetween('2026-01-01', '2029-12-31'), fc.integer({ min: 2018, max: 2030 })).map(([on, bucketYear]) => ({
        kind: 'payment' as const,
        on,
        bucketYear,
      })),
    ),
    { maxLength: 12 },
  );

  function build(records: { kind: string; on: LocalDate; bucketYear?: number }[]): LedgerSnapshot {
    return snapshot({
      incomes: records.filter((r) => r.kind === 'income').map((r) => income({ amount: '10.00', on: r.on })),
      openings: records.filter((r) => r.kind === 'opening').map((r) => opening({ amount: '5.00', on: r.on })),
      payments: records
        .filter((r) => r.kind === 'payment')
        .map((r) => payment({ amount: '1.00', on: r.on, allocations: [[r.bucketYear ?? yearOf(r.on), '1.00']] })),
    });
  }

  it('is contiguous, ascending and spans exactly tracking start / today / every record year (property)', () => {
    fc.assert(
      fc.property(dateBetween('2026-01-01', '2026-12-31'), dateBetween('2026-01-01', '2031-12-31'), recordsArb, (trackingStart, today, records) => {
        const snap = build(records);
        const years = availablePeriodYears(trackingStart, today, snap);
        const referenced = [
          yearOf(trackingStart),
          yearOf(today),
          ...records.map((r) => yearOf(r.on)),
          ...records.flatMap((r) => (r.kind === 'payment' ? [r.bucketYear] : [])),
        ];
        const lo = Math.min(...referenced);
        const hi = Math.max(...referenced);
        expect(years).toEqual(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
        expect(years).toContain(currentPeriodYear(today));
      }),
    );
  });

  it('a backdated tracking start adds its year even with no records', () => {
    expect(availablePeriodYears(d('2024-06-01'), d('2026-10-03'), snapshot())).toEqual([2024, 2025, 2026]);
  });

  it('keeps every earlier year after the rollover and never drops an unpaid year', () => {
    const snap = snapshot({
      openings: [opening({ amount: '300.00', on: '2024-06-30' })],
      incomes: [income({ amount: '1,000.00', on: '2026-11-01' })],
      payments: [payment({ amount: '50.00', on: '2026-12-01', allocations: [[2024, '50.00']] })],
    });
    const trackingStart = d('2026-10-03');
    expect(availablePeriodYears(trackingStart, d('2026-12-31'), snap)).toEqual([2024, 2025, 2026]);
    expect(availablePeriodYears(trackingStart, d('2027-01-01'), snap)).toEqual([2024, 2025, 2026, 2027]);
    expect(currentPeriodYear(d('2027-01-01'))).toBe(2027);

    // The year changing never settles anything: the unpaid 2024 and 2026 buckets carry over.
    const cad = computeBalances(snap, trackingStart).CAD;
    expect(cad.stillToGiveMinor).toBe(m('350.00'));
    expect(carriedOverMinor(cad, 2027)).toBe(m('350.00'));
    expect(carriedOverMinor(cad, 2026)).toBe(m('250.00'));
  });

  it('copes with very large ledgers (no argument-spreading stack overflow)', () => {
    const many: LedgerSnapshot = snapshot({
      incomes: Array.from({ length: 150_000 }, (_, i) =>
        income({ amount: '1.00', on: fromEpochDay(toEpochDay(d('2026-10-03')) + (i % 400)), id: `inc-${i}` }),
      ),
    });
    expect(availablePeriodYears(d('2026-10-03'), d('2026-10-03'), many)).toEqual([2026, 2027]);
    expect(allTimeRange(d('2026-10-03'), d('2026-10-03'), many)).toMatchObject({ start: '2026-10-03', end: '2027-11-06' });
  });
});

describe('allTimeRange', () => {
  it('starts at the earliest of tracking start and record dates, ends at the latest of today and record dates', () => {
    const snap = snapshot({
      openings: [opening({ amount: '1.00', on: '2021-02-03' })],
      incomes: [income({ amount: '1.00', on: '2027-05-05' })],
    });
    expect(allTimeRange(d('2026-10-03'), d('2026-11-01'), snap)).toMatchObject({ start: '2021-02-03', end: '2027-05-05' });
    expect(allTimeRange(d('2026-10-03'), d('2026-11-01'), snapshot())).toMatchObject({ start: '2026-10-03', end: '2026-11-01' });
    // A tracking start later than today (set in advance) still yields a non-empty range.
    expect(allTimeRange(d('2026-12-01'), d('2026-11-01'), snapshot())).toMatchObject({ start: '2026-12-01', end: '2026-12-01' });
  });
});
