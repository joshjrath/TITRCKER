import { describe, expect, it } from 'vitest';
import { areaPath, clamp01, ellipseArcPath, ellipsePoint, fmt, pct, roundedPath, simplifyVertices, stepVertices } from './geometry';
import { DEFAULT_ORBIT, orbitModel } from './orbit';

describe('fmt', () => {
  it('rounds to two decimals without -0', () => {
    expect(fmt(1.23456)).toBe('1.23');
    expect(fmt(-0.001)).toBe('0');
    expect(fmt(10)).toBe('10');
  });
});

describe('stepVertices', () => {
  it('holds each value until the next point (step-after)', () => {
    expect(
      stepVertices([
        { x: 0, y: 100 },
        { x: 10, y: 60 },
        { x: 30, y: 60 },
        { x: 40, y: 20 },
      ]),
    ).toEqual([
      { x: 0, y: 100 },
      { x: 10, y: 100 },
      { x: 10, y: 60 },
      { x: 40, y: 60 },
      { x: 40, y: 20 },
    ]);
  });

  it('keeps a single point', () => {
    expect(stepVertices([{ x: 3, y: 4 }])).toEqual([{ x: 3, y: 4 }]);
  });
});

describe('simplifyVertices', () => {
  it('removes duplicates and collinear midpoints', () => {
    expect(
      simplifyVertices([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
    ]);
  });

  it('keeps reversals', () => {
    expect(simplifyVertices([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }])).toHaveLength(3);
  });
});

describe('roundedPath', () => {
  it('rounds corners with a quadratic curve', () => {
    const d = roundedPath(
      [
        { x: 0, y: 100 },
        { x: 50, y: 100 },
        { x: 50, y: 0 },
      ],
      4,
    );
    expect(d).toBe('M0 100L46 100Q50 100 50 96L50 0');
  });

  it('clips the radius to half the shortest adjacent segment', () => {
    const d = roundedPath(
      [
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 8 },
        { x: 20, y: 8 },
      ],
      4,
    );
    expect(d).toBe('M0 10L9 10Q10 10 10 9L10 9Q10 8 11 8L20 8');
  });

  it('handles 0 and 1 vertices', () => {
    expect(roundedPath([], 4)).toBe('');
    expect(roundedPath([{ x: 1, y: 2 }], 4)).toBe('M1 2');
  });
});

describe('areaPath', () => {
  it('closes down to the baseline', () => {
    expect(areaPath([{ x: 0, y: 50 }, { x: 20, y: 50 }], 4, 100)).toBe('M0 50L20 50L20 100L0 100Z');
    expect(areaPath([{ x: 0, y: 50 }], 4, 100)).toBe('');
  });
});

describe('ellipse helpers', () => {
  const e = { cx: 50, cy: 50, rx: 40, ry: 20 };
  it('finds points on the ellipse', () => {
    const p = ellipsePoint(e, Math.PI);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(50);
  });

  it('builds arcs with correct large-arc and sweep flags', () => {
    expect(ellipseArcPath(e, Math.PI, 1.5 * Math.PI)).toBe('M10 50A40 20 0 0 1 50 30');
    expect(ellipseArcPath(e, Math.PI, 2.25 * Math.PI)).toContain('A40 20 0 1 1');
    expect(ellipseArcPath(e, 1, 1)).toBe('');
  });
});

describe('orbitModel', () => {
  it('splits the arc at the progress point', () => {
    const m = orbitModel(0.5);
    const mid = ((DEFAULT_ORBIT.startDeg + DEFAULT_ORBIT.endDeg) / 2) * (Math.PI / 180);
    expect(m.marker.x).toBeCloseTo(DEFAULT_ORBIT.cx + DEFAULT_ORBIT.rx * Math.cos(mid));
    expect(m.donePath.startsWith('M')).toBe(true);
    expect(m.restPath.startsWith('M')).toBe(true);
  });

  it('clamps progress and keeps the arc inside the 0..100 box', () => {
    expect(orbitModel(-1).progress).toBe(0);
    expect(orbitModel(2).progress).toBe(1);
    expect(orbitModel(0).donePath).toBe('');
    expect(orbitModel(1).restPath).toBe('');
    for (let i = 0; i <= 20; i += 1) {
      const { marker } = orbitModel(i / 20);
      expect(marker.x).toBeGreaterThanOrEqual(0);
      expect(marker.x).toBeLessThanOrEqual(100);
      expect(marker.y).toBeGreaterThanOrEqual(0);
      expect(marker.y).toBeLessThanOrEqual(100);
    }
  });
});

describe('clamp01 / pct', () => {
  it('clamps and formats', () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(1);
    expect(pct(0.375)).toBe('37.5%');
    expect(pct(1.4)).toBe('100%');
  });
});
