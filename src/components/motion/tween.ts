/** Pure helpers for number tweens. Money stays in integer minor units at every frame. */

export const AMOUNT_TWEEN_MS = 500;

/** Cubic ease-out: fast start, gentle landing. t in [0, 1]. */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/**
 * The integer minor-unit value shown at `elapsedMs` of a tween from `from` to `to`.
 * Always an integer; exactly `from` at 0 and exactly `to` at or after `durationMs`.
 */
export function tweenMinor(from: number, to: number, elapsedMs: number, durationMs = AMOUNT_TWEEN_MS): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to;
  if (elapsedMs <= 0) return from;
  return from + Math.round((to - from) * easeOutCubic(elapsedMs / durationMs));
}
