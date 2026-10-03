import { describe, expect, it } from 'vitest';
import { mergeSeries, nearestIndex, seriesExtent, stepIndex } from './series';

describe('mergeSeries', () => {
  const accrued = [
    { date: '2026-10-03', valueMinor: 0 },
    { date: '2026-10-10', valueMinor: 17_500 },
    { date: '2026-11-02', valueMinor: 30_000 },
  ];
  const given = [
    { date: '2026-10-03', valueMinor: 0 },
    { date: '2026-10-20', valueMinor: 10_000 },
  ];

  it('merges dates and carries values forward', () => {
    expect(mergeSeries(accrued, given)).toEqual([
      { date: '2026-10-03', accruedMinor: 0, givenMinor: 0 },
      { date: '2026-10-10', accruedMinor: 17_500, givenMinor: 0 },
      { date: '2026-10-20', accruedMinor: 17_500, givenMinor: 10_000 },
      { date: '2026-11-02', accruedMinor: 30_000, givenMinor: 10_000 },
    ]);
  });

  it('marks given as null when there is no given series', () => {
    expect(mergeSeries(accrued, []).every((p) => p.givenMinor === null)).toBe(true);
  });

  it('uses start values before the first point and sorts input', () => {
    const out = mergeSeries([{ date: '2026-10-05', valueMinor: 500 }], [{ date: '2026-10-01', valueMinor: 7 }], {
      accruedStart: 200,
    });
    expect(out[0]).toEqual({ date: '2026-10-01', accruedMinor: 200, givenMinor: 7 });
    expect(mergeSeries([...accrued].reverse(), [])[1]!.accruedMinor).toBe(17_500);
  });

  it('handles empty input', () => {
    expect(mergeSeries([], [])).toEqual([]);
  });
});

describe('nearestIndex', () => {
  it('finds the closest x', () => {
    const xs = [0, 10, 20, 40];
    expect(nearestIndex(xs, -5)).toBe(0);
    expect(nearestIndex(xs, 14)).toBe(1);
    expect(nearestIndex(xs, 15)).toBe(1);
    expect(nearestIndex(xs, 31)).toBe(3);
    expect(nearestIndex(xs, 99)).toBe(3);
    expect(nearestIndex([], 3)).toBe(-1);
  });
});

describe('stepIndex', () => {
  it('steps, jumps and starts from the latest point', () => {
    expect(stepIndex(-1, 'ArrowLeft', 5)).toBe(4);
    expect(stepIndex(2, 'ArrowLeft', 5)).toBe(1);
    expect(stepIndex(0, 'ArrowLeft', 5)).toBe(0);
    expect(stepIndex(4, 'ArrowRight', 5)).toBe(4);
    expect(stepIndex(1, 'Home', 5)).toBe(0);
    expect(stepIndex(1, 'End', 5)).toBe(4);
    expect(stepIndex(1, 'PageDown', 20)).toBe(6);
    expect(stepIndex(1, 'a', 5)).toBeNull();
    expect(stepIndex(-1, 'ArrowRight', 0)).toBeNull();
  });
});

describe('seriesExtent', () => {
  it('spans zero, both series and extras', () => {
    expect(
      seriesExtent(
        [
          { date: 'a', accruedMinor: 300, givenMinor: 500 },
          { date: 'b', accruedMinor: -20, givenMinor: null },
        ],
        [700],
      ),
    ).toEqual({ min: -20, max: 700 });
  });
});
