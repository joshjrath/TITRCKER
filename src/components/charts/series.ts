/**
 * Data shaping for the cumulative chart: merges the accrued and given step series onto one set of
 * inspectable dates and finds the nearest one to a pointer position. Values stay integer minor units.
 */

export interface SeriesPointLike {
  date: string;
  valueMinor: number;
}

export interface InspectPoint {
  date: string;
  accruedMinor: number;
  /** null when the chart has no given series. */
  givenMinor: number | null;
}

function byDate(a: SeriesPointLike, b: SeriesPointLike): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

/**
 * Every distinct date of either series, ascending, with each series' value carried forward
 * (step-after). Before a series' first point its value is `fallback` (the series start value).
 */
export function mergeSeries(
  accrued: readonly SeriesPointLike[],
  given: readonly SeriesPointLike[],
  opts: { accruedStart?: number; givenStart?: number } = {},
): InspectPoint[] {
  const a = [...accrued].sort(byDate);
  const g = [...given].sort(byDate);
  const hasGiven = g.length > 0;
  const dates = Array.from(new Set([...a.map((p) => p.date), ...g.map((p) => p.date)])).sort();
  let ai = 0;
  let gi = 0;
  let av = opts.accruedStart ?? 0;
  let gv = opts.givenStart ?? 0;
  return dates.map((date) => {
    while (ai < a.length && a[ai]!.date <= date) av = a[ai++]!.valueMinor;
    while (gi < g.length && g[gi]!.date <= date) gv = g[gi++]!.valueMinor;
    return { date, accruedMinor: av, givenMinor: hasGiven ? gv : null };
  });
}

/** Index of the value in ascending `xs` closest to `x` (ties go to the earlier index); -1 if empty. */
export function nearestIndex(xs: readonly number[], x: number): number {
  if (xs.length === 0) return -1;
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(xs[lo - 1]! - x) <= Math.abs(xs[lo]! - x)) return lo - 1;
  return lo;
}

/** Keyboard stepping: ArrowLeft/Right move by one, Home/End jump, PageUp/Down move by `page`. */
export function stepIndex(current: number, key: string, length: number, page = 5): number | null {
  if (length === 0) return null;
  const last = length - 1;
  const from = current < 0 ? last : current;
  switch (key) {
    case 'ArrowLeft':
      return current < 0 ? last : Math.max(0, from - 1);
    case 'ArrowRight':
      return current < 0 ? last : Math.min(last, from + 1);
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'PageUp':
      return Math.max(0, from - page);
    case 'PageDown':
      return Math.min(last, from + page);
    default:
      return null;
  }
}

/** Largest value across both series and the start values (>= 0), for the y scale. */
export function seriesExtent(points: readonly InspectPoint[], extra: readonly number[] = []): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const v of extra) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  for (const p of points) {
    min = Math.min(min, p.accruedMinor, p.givenMinor ?? 0);
    max = Math.max(max, p.accruedMinor, p.givenMinor ?? 0);
  }
  return { min, max };
}
