import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { candidateSteps, formatMinorDisplay, formatTick, linearScale, niceScale } from './scale';

describe('candidateSteps', () => {
  it('is ascending and integer', () => {
    const steps = candidateSteps();
    expect(steps.slice(0, 10)).toEqual([1, 2, 5, 10, 20, 25, 50, 100, 200, 250]);
    for (let i = 1; i < steps.length; i += 1) {
      expect(Number.isInteger(steps[i])).toBe(true);
      expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    }
  });
});

describe('niceScale', () => {
  it('covers a typical tithe total with 3-4 whole-dollar ticks', () => {
    // CAD 412.50 -> 0, 200, 400, 600 (in minor units)
    expect(niceScale(0, 41_250)).toEqual({ min: 0, max: 60_000, step: 20_000, ticks: [0, 20_000, 40_000, 60_000] });
  });

  it('uses 2.5 steps when they fit best', () => {
    expect(niceScale(0, 70_000).ticks).toEqual([0, 25_000, 50_000, 75_000]);
  });

  it('lands exactly on a round maximum', () => {
    expect(niceScale(0, 30_000).ticks).toEqual([0, 10_000, 20_000, 30_000]);
  });

  it('returns a default 0..1.00 scale for an empty range', () => {
    expect(niceScale(0, 0)).toEqual({ min: 0, max: 100, step: 100, ticks: [0, 100] });
  });

  it('includes negative values below zero', () => {
    const s = niceScale(-1_250, 4_000);
    expect(s.min).toBeLessThanOrEqual(-1_250);
    expect(s.ticks).toContain(0);
    expect(s.ticks.length).toBeLessThanOrEqual(4);
  });

  it('handles the largest supported amounts', () => {
    const s = niceScale(0, 99_999_999_999);
    expect(s.max).toBeGreaterThanOrEqual(99_999_999_999);
    expect(s.ticks.every(Number.isSafeInteger)).toBe(true);
  });

  it('rejects non-integer input', () => {
    expect(() => niceScale(0, 1.5)).toThrow(RangeError);
  });

  it('always yields 2-4 integer ticks that cover the data (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99_999_999_999 }), (max) => {
        const s = niceScale(0, max);
        expect(s.ticks.length).toBeGreaterThanOrEqual(2);
        expect(s.ticks.length).toBeLessThanOrEqual(4);
        expect(s.ticks.every(Number.isSafeInteger)).toBe(true);
        expect(s.ticks[0]).toBe(0);
        expect(s.max).toBeGreaterThanOrEqual(max);
        // Not wastefully large: the data fills more than a third of the axis.
        expect(max * 3).toBeGreaterThan(s.max);
      }),
    );
  });
});

describe('formatTick', () => {
  it('drops cents when every tick is a whole unit', () => {
    expect(formatTick(150_000, 50_000)).toBe('1,500');
    expect(formatTick(0, 20_000)).toBe('0');
    expect(formatTick(-10_000, 10_000)).toBe('\u2212100');
    expect(formatMinorDisplay(-2_500)).toBe('\u221225.00');
  });

  it('keeps cents for sub-unit steps', () => {
    expect(formatTick(250, 250)).toBe('2.50');
    expect(formatTick(5, 5)).toBe('0.05');
  });
});

describe('linearScale', () => {
  it('maps the domain onto the range', () => {
    const y = linearScale(0, 60_000, 200, 20);
    expect(y(0)).toBe(200);
    expect(y(60_000)).toBe(20);
    expect(y(30_000)).toBe(110);
  });

  it('maps a degenerate domain to the range start', () => {
    expect(linearScale(5, 5, 10, 20)(5)).toBe(10);
  });
});
