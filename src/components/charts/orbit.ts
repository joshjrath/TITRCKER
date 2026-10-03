/**
 * Geometry of the orbital arc: a thin elliptical sweep in a 0..100 x 0..100 box (stretched to the
 * container), from behind the hero amount over the top and down toward the year-end node.
 */
import { clamp01, ellipseArcPath, ellipsePoint, type Ellipse, type Pt } from './geometry';

export interface OrbitGeometry extends Ellipse {
  /** Start angle in degrees (SVG convention: 0 = right, 90 = down, 180 = left, 270 = up). */
  startDeg: number;
  /** End angle in degrees; must be greater than startDeg (clockwise sweep on screen). */
  endDeg: number;
}

/**
 * Default (desktop, >=1200px) framing over the whole hero + year-end surface. It starts at about
 * (35%, 16%) — above the top of the hero digits even for long amounts such as "12,345.67 CAD" —
 * crests near the top edge and descends to the payout node at the right (95%, 67%).
 */
export const DEFAULT_ORBIT: OrbitGeometry = { cx: 52, cy: 96, rx: 46, ry: 86, startDeg: 248, endDeg: 340 };

/**
 * Compact (<1200px) framing, drawn in a short band across the top of the container
 * (`--orbit-band`, default 48px, offset `--orbit-band-top`, default 12px): a shallow dome from (46%, bottom of band) over (72%, 10%) to the
 * payout node at (95%, 71%). It stays above the hero digits in single-column layouts.
 */
export const COMPACT_ORBIT: OrbitGeometry = { cx: 72, cy: 153, rx: 28, ry: 143, startDeg: 202, endDeg: 325 };

const DEG = Math.PI / 180;

export interface OrbitModel {
  /** Full arc (start to end). */
  fullPath: string;
  /** Start to progress. */
  donePath: string;
  /** Progress to end. */
  restPath: string;
  start: Pt;
  marker: Pt;
  end: Pt;
  /** Clamped progress actually drawn. */
  progress: number;
}

/** Splits the orbit at `progress` (0..1, clamped). Points are in the 0..100 box. */
export function orbitModel(progress: number, g: OrbitGeometry = DEFAULT_ORBIT): OrbitModel {
  const p = clamp01(progress);
  const t0 = g.startDeg * DEG;
  const t1 = g.endDeg * DEG;
  const tp = t0 + (t1 - t0) * p;
  return {
    fullPath: ellipseArcPath(g, t0, t1),
    donePath: ellipseArcPath(g, t0, tp),
    restPath: ellipseArcPath(g, tp, t1),
    start: ellipsePoint(g, t0),
    marker: ellipsePoint(g, tp),
    end: ellipsePoint(g, t1),
    progress: p,
  };
}
