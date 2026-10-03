import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { easeOutCubic, tweenMinor } from './tween';

describe('easeOutCubic', () => {
  it('runs 0 -> 1 and clamps', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });
});

describe('tweenMinor', () => {
  it('starts and ends exactly', () => {
    expect(tweenMinor(17_500, 35_000, 0)).toBe(17_500);
    expect(tweenMinor(17_500, 35_000, 500)).toBe(35_000);
    expect(tweenMinor(17_500, 35_000, 9_999)).toBe(35_000);
    expect(tweenMinor(17_500, 35_000, 10, 0)).toBe(35_000);
  });

  it('is always an integer between the endpoints and monotonic (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -99_999_999_999, max: 99_999_999_999 }),
        fc.integer({ min: -99_999_999_999, max: 99_999_999_999 }),
        fc.integer({ min: 0, max: 500 }),
        (from, to, t) => {
          const v = tweenMinor(from, to, t);
          const later = tweenMinor(from, to, Math.min(500, t + 16));
          expect(Number.isSafeInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(Math.min(from, to));
          expect(v).toBeLessThanOrEqual(Math.max(from, to));
          if (to >= from) expect(later).toBeGreaterThanOrEqual(v);
          else expect(later).toBeLessThanOrEqual(v);
        },
      ),
    );
  });
});
