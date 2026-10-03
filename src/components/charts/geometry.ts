/**
 * SVG path geometry shared by the arc, the timeline and the cumulative chart. Pixel geometry only:
 * money never passes through here except as already-scaled coordinates.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

const EPS = 1e-9;

/** Compact number for path data: at most 2 decimals, no trailing zeros, no "-0". */
export function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}

/**
 * Step-after vertices: the value holds until the next point's x, then jumps.
 * `[(0,10),(5,4),(9,4)]` -> `[(0,10),(5,10),(5,4),(9,4)]` (after simplification).
 */
export function stepVertices(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev) out.push({ x: p.x, y: prev.y });
    out.push({ x: p.x, y: p.y });
  });
  return simplifyVertices(out);
}

/** Removes consecutive duplicates and middle points of collinear runs. */
export function simplifyVertices(vertices: readonly Pt[]): Pt[] {
  const dedup: Pt[] = [];
  for (const v of vertices) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.abs(last.x - v.x) > EPS || Math.abs(last.y - v.y) > EPS) dedup.push(v);
  }
  if (dedup.length < 3) return dedup;
  const out: Pt[] = [dedup[0]!];
  for (let i = 1; i < dedup.length - 1; i += 1) {
    const a = out[out.length - 1]!;
    const b = dedup[i]!;
    const c = dedup[i + 1]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    // Drop b only when a-b-c continue in the same direction.
    if (Math.abs(cross) > EPS || dot < 0) out.push(b);
  }
  out.push(dedup[dedup.length - 1]!);
  return out;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Polyline path with each interior corner softened by a quadratic curve of up to `radius`
 * (clipped to half of each adjacent segment, so short steps stay faithful).
 */
export function roundedPath(vertices: readonly Pt[], radius: number): string {
  if (vertices.length === 0) return '';
  const first = vertices[0]!;
  let d = `M${fmt(first.x)} ${fmt(first.y)}`;
  if (vertices.length === 1) return d;
  for (let i = 1; i < vertices.length - 1; i += 1) {
    const prev = vertices[i - 1]!;
    const v = vertices[i]!;
    const next = vertices[i + 1]!;
    const lin = dist(prev, v);
    const lout = dist(v, next);
    const r = Math.max(0, Math.min(radius, lin / 2, lout / 2));
    if (r < EPS || lin < EPS || lout < EPS) {
      d += `L${fmt(v.x)} ${fmt(v.y)}`;
      continue;
    }
    const a = { x: v.x - ((v.x - prev.x) / lin) * r, y: v.y - ((v.y - prev.y) / lin) * r };
    const b = { x: v.x + ((next.x - v.x) / lout) * r, y: v.y + ((next.y - v.y) / lout) * r };
    d += `L${fmt(a.x)} ${fmt(a.y)}Q${fmt(v.x)} ${fmt(v.y)} ${fmt(b.x)} ${fmt(b.y)}`;
  }
  const last = vertices[vertices.length - 1]!;
  d += `L${fmt(last.x)} ${fmt(last.y)}`;
  return d;
}

/** Closed area under a rounded polyline down to `baselineY`. */
export function areaPath(vertices: readonly Pt[], radius: number, baselineY: number): string {
  if (vertices.length < 2) return '';
  const first = vertices[0]!;
  const last = vertices[vertices.length - 1]!;
  return `${roundedPath(vertices, radius)}L${fmt(last.x)} ${fmt(baselineY)}L${fmt(first.x)} ${fmt(baselineY)}Z`;
}

/** Point on an axis-aligned ellipse at parametric angle `theta` (radians; SVG y grows downward). */
export function ellipsePoint(e: Ellipse, theta: number): Pt {
  return { x: e.cx + e.rx * Math.cos(theta), y: e.cy + e.ry * Math.sin(theta) };
}

/**
 * Elliptical arc path from `theta0` to `theta1` (radians). Increasing angles sweep clockwise on
 * screen. Returns '' for an empty sweep; sweeps are clamped just under a full turn.
 */
export function ellipseArcPath(e: Ellipse, theta0: number, theta1: number): string {
  let delta = theta1 - theta0;
  if (Math.abs(delta) < 1e-6) return '';
  const maxSweep = 2 * Math.PI - 1e-4;
  if (Math.abs(delta) > maxSweep) delta = Math.sign(delta) * maxSweep;
  const a = ellipsePoint(e, theta0);
  const b = ellipsePoint(e, theta0 + delta);
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta > 0 ? 1 : 0;
  return `M${fmt(a.x)} ${fmt(a.y)}A${fmt(e.rx)} ${fmt(e.ry)} 0 ${large} ${sweep} ${fmt(b.x)} ${fmt(b.y)}`;
}

/** Clamps to [0, 1]; NaN becomes 0. */
export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return n === Infinity ? 1 : 0;
  return Math.min(1, Math.max(0, n));
}

/** Percentage string for SVG attributes ("37.5%"), 3 decimals max. */
export function pct(fraction: number): string {
  return `${Math.round(clamp01(fraction) * 100_000) / 1000}%`;
}
