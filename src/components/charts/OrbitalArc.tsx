import { useId } from 'react';
import styles from './charts.module.css';
import { pct } from './geometry';
import { DEFAULT_ORBIT, orbitModel, type OrbitGeometry } from './orbit';

export interface OrbitalArcProps {
  /** Period progress, 0 (period start) .. 1 (payout date). Clamped. */
  progress: number;
  /** 'empty' draws the orbit faintly with no progress marker (new account). */
  variant?: 'active' | 'empty';
  /**
   * Tune the ellipse inside the 0..100 box the arc is stretched over (it fills its positioned
   * parent). Angles in degrees, SVG convention (180 = left, 270 = top, 360 = right).
   */
  geometry?: Partial<OrbitGeometry>;
  className?: string;
}

/**
 * The signature gesture: a thin elliptical orbit behind the hero amount that sweeps toward the
 * payout date. Decorative only (aria-hidden); the period's meaning is carried by text elsewhere.
 * Place it inside a `position: relative` container; it fills that container and never takes
 * pointer events. Stroke weight stays at 1.25-1.5px at any size (non-scaling strokes).
 */
export function OrbitalArc({ progress, variant = 'active', geometry, className }: OrbitalArcProps) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const g: OrbitGeometry = { ...DEFAULT_ORBIT, ...geometry };
  const m = orbitModel(variant === 'empty' ? 0 : progress, g);
  const doneId = `${id}-done`;
  const restId = `${id}-rest`;
  const isEmpty = variant === 'empty';

  return (
    <svg
      className={[styles.viz, styles.orbit, className].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
        <defs>
          <linearGradient id={doneId} gradientUnits="userSpaceOnUse" x1={m.start.x} y1={0} x2={m.marker.x} y2={0}>
            <stop offset="0" className={styles.stopAccent} stopOpacity={0.08} />
            <stop offset="0.7" className={styles.stopAccent} stopOpacity={0.38} />
            <stop offset="1" className={styles.stopAccent} stopOpacity={0.85} />
          </linearGradient>
          <linearGradient id={restId} gradientUnits="userSpaceOnUse" x1={m.marker.x} y1={0} x2={m.end.x} y2={0}>
            <stop offset="0" className={styles.stopAccent} stopOpacity={0.2} />
            <stop offset="0.55" className={styles.stopAccent} stopOpacity={0.1} />
            <stop offset="1" className={styles.stopCopper} stopOpacity={0.5} />
          </linearGradient>
        </defs>
        {isEmpty ? (
          <path d={m.fullPath} className={styles.orbitEmpty} vectorEffect="non-scaling-stroke" />
        ) : (
          <>
            {m.restPath && (
              <path d={m.restPath} className={styles.orbitTrail} stroke={`url(#${restId})`} vectorEffect="non-scaling-stroke" />
            )}
            {m.donePath && (
              <path d={m.donePath} className={styles.orbitDone} stroke={`url(#${doneId})`} vectorEffect="non-scaling-stroke" />
            )}
          </>
        )}
      </svg>

      {/* Payout node (copper). Circles sit in the outer, unscaled coordinate space so they stay round. */}
      <circle cx={pct(m.end.x / 100)} cy={pct(m.end.y / 100)} r={7} className={styles.orbitEndRing} />
      <circle
        cx={pct(m.end.x / 100)}
        cy={pct(m.end.y / 100)}
        r={3}
        className={isEmpty ? styles.orbitEndDotMuted : styles.orbitEndDot}
      />

      {!isEmpty && (
        <>
          <circle cx={pct(m.marker.x / 100)} cy={pct(m.marker.y / 100)} r={9} className={styles.orbitMarkerHalo} />
          <circle cx={pct(m.marker.x / 100)} cy={pct(m.marker.y / 100)} r={3.5} className={styles.orbitMarker} />
        </>
      )}
    </svg>
  );
}
