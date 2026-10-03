import { useId } from 'react';
import styles from './charts.module.css';
import { pct } from './geometry';
import { COMPACT_ORBIT, DEFAULT_ORBIT, orbitModel, type OrbitGeometry } from './orbit';

export interface OrbitalArcProps {
  /** Period progress, 0 (period start) .. 1 (payout date). Clamped. */
  progress: number;
  /** 'empty' draws the orbit faintly with no progress marker (new account). */
  variant?: 'active' | 'empty';
  /**
   * Tune the ellipse inside the 0..100 box the arc is stretched over (it fills its positioned
   * parent). Angles in degrees, SVG convention (180 = left, 270 = top, 360 = right).
   * Applies from 1200px up (and everywhere when `compactGeometry` is null).
   */
  geometry?: Partial<OrbitGeometry>;
  /**
   * Below 1200px the arc is drawn in a short band across the top of the parent
   * (`--orbit-band`, default 48px, starting `--orbit-band-top`, default 12px, from the top) with this geometry, so it stays above the hero digits in
   * single-column layouts. Defaults to `COMPACT_ORBIT`; pass null to keep `geometry` at every width.
   */
  compactGeometry?: Partial<OrbitGeometry> | null;
  className?: string;
}

interface OrbitSvgProps {
  id: string;
  g: OrbitGeometry;
  progress: number;
  isEmpty: boolean;
  className: string;
}

function OrbitSvg({ id, g, progress, isEmpty, className }: OrbitSvgProps) {
  const m = orbitModel(isEmpty ? 0 : progress, g);
  const doneId = `${id}-done`;
  const restId = `${id}-rest`;
  return (
    <svg className={className} aria-hidden="true" focusable="false">
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
      <circle cx={pct(m.end.x / 100)} cy={pct(m.end.y / 100)} r={6} className={styles.orbitEndRing} />
      <circle
        cx={pct(m.end.x / 100)}
        cy={pct(m.end.y / 100)}
        r={2.75}
        className={isEmpty ? styles.orbitEndDotMuted : styles.orbitEndDot}
      />

      {!isEmpty && (
        <>
          <circle cx={pct(m.marker.x / 100)} cy={pct(m.marker.y / 100)} r={8} className={styles.orbitMarkerHalo} />
          <circle cx={pct(m.marker.x / 100)} cy={pct(m.marker.y / 100)} r={3.5} className={styles.orbitMarker} />
        </>
      )}
    </svg>
  );
}

/**
 * The signature gesture: a thin elliptical orbit behind the hero amount that sweeps toward the
 * payout date. Decorative only (aria-hidden); the period's meaning is carried by text elsewhere.
 * Place it inside a `position: relative` container; it fills that container (from 1200px up) or a
 * band across its top (below 1200px) and never takes pointer events. Stroke weight stays at
 * 1.25-1.5px at any size (non-scaling strokes).
 */
export function OrbitalArc({ progress, variant = 'active', geometry, compactGeometry, className }: OrbitalArcProps) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const isEmpty = variant === 'empty';
  const wide: OrbitGeometry = { ...DEFAULT_ORBIT, ...geometry };
  const base = [styles.viz, styles.orbit, className].filter(Boolean).join(' ');

  if (compactGeometry === null) {
    return <OrbitSvg id={id} g={wide} progress={progress} isEmpty={isEmpty} className={base} />;
  }
  const compact: OrbitGeometry = { ...COMPACT_ORBIT, ...compactGeometry };
  return (
    <>
      <OrbitSvg id={`${id}w`} g={wide} progress={progress} isEmpty={isEmpty} className={`${base} ${styles.orbitWide}`} />
      <OrbitSvg id={`${id}c`} g={compact} progress={progress} isEmpty={isEmpty} className={`${base} ${styles.orbitCompact}`} />
    </>
  );
}
