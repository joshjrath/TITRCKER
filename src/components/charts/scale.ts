/**
 * Axis scales for money charts, computed entirely in integer minor units.
 *
 * Tick values are always integers (multiples of a "nice" step: 1, 2, 2.5 or 5 x 10^k minor units),
 * so labels are produced by the domain's string-based formatter and never by float arithmetic.
 */
import { formatMinor, splitMinor, toMinor } from '@/domain';

export interface NiceScale {
  /** Lowest tick (<= 0), integer minor units. */
  min: number;
  /** Highest tick (>= 0), integer minor units. */
  max: number;
  /** Distance between ticks, integer minor units (> 0). */
  step: number;
  /** Ascending tick values from `min` to `max` inclusive. */
  ticks: number[];
}

/** Default scale used when there is nothing to show: 0 .. 1.00. */
const EMPTY_SCALE_MAX = 100;
const MAX_POWER = 15;

/** Ascending candidate steps: 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, ... (all integers). */
export function candidateSteps(): number[] {
  const steps: number[] = [];
  for (let k = 0; k <= MAX_POWER; k += 1) {
    const p = 10 ** k;
    steps.push(p, 2 * p);
    if (k >= 1) steps.push(25 * (p / 10));
    steps.push(5 * p);
  }
  return steps;
}

const STEPS = candidateSteps();

function floorDiv(a: number, b: number): number {
  const q = Math.trunc(a / b);
  return a % b !== 0 && a < 0 ? q - 1 : q;
}

function ceilDiv(a: number, b: number): number {
  const q = Math.trunc(a / b);
  return a % b !== 0 && a > 0 ? q + 1 : q;
}

/**
 * A scale that always includes 0 and covers [minValue, maxValue] with at most `maxIntervals`
 * intervals (so 2..`maxIntervals + 1` ticks). Inputs must be safe integers (minor units).
 */
export function niceScale(minValue: number, maxValue: number, maxIntervals = 3): NiceScale {
  if (!Number.isSafeInteger(minValue) || !Number.isSafeInteger(maxValue)) {
    throw new RangeError('niceScale expects integer minor units');
  }
  if (!Number.isInteger(maxIntervals) || maxIntervals < 1) {
    throw new RangeError('maxIntervals must be a positive integer');
  }
  const lo = Math.min(0, minValue, maxValue);
  const hi = Math.max(0, minValue, maxValue);
  if (lo === hi) {
    return { min: 0, max: EMPTY_SCALE_MAX, step: EMPTY_SCALE_MAX, ticks: [0, EMPTY_SCALE_MAX] };
  }
  for (const step of STEPS) {
    const first = floorDiv(lo, step);
    const last = ceilDiv(hi, step);
    if (last - first <= maxIntervals) {
      const ticks: number[] = [];
      for (let i = first; i <= last; i += 1) ticks.push(i * step);
      return { min: first * step, max: last * step, step, ticks };
    }
  }
  throw new RangeError('Value range too large for a nice scale');
}

/** Typographic minus for displayed negatives (the hyphen looks detached between tabular digits). */
export function displayMinus(text: string): string {
  return text.replace(/^-/, '\u2212');
}

/** `formatMinor` for display: "1,750.00", "−25.00". */
export function formatMinorDisplay(valueMinor: number): string {
  return displayMinus(formatMinor(toMinor(valueMinor)));
}

/**
 * Formats an axis tick. When every tick is a whole currency unit the cents are dropped
 * ("1,500" rather than "1,500.00"); otherwise the full amount is shown ("2.50").
 */
export function formatTick(valueMinor: number, step: number): string {
  const minor = toMinor(valueMinor);
  if (step % 100 === 0) {
    const { sign, whole } = splitMinor(minor);
    return displayMinus(`${sign}${whole}`);
  }
  return displayMinus(formatMinor(minor));
}

/** Linear map from [d0, d1] to [r0, r1]; a degenerate domain maps everything to r0. */
export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  if (span === 0) return () => r0;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}
