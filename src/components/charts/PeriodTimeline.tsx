import styles from './charts.module.css';
import { pct } from './geometry';
import { dateFraction, describeTimeline, monthBoundaries, monthSegments } from './timeline';

export interface PeriodTimelineProps {
  /** Period start, YYYY-MM-DD. */
  start: string;
  /** Period end, YYYY-MM-DD. */
  end: string;
  /** Today in the owner's time zone, YYYY-MM-DD. */
  today: string;
  /** Payout date, YYYY-MM-DD (usually the period end). Clamped onto the track. */
  payoutDate: string;
  /**
   * Text equivalent read by assistive technology, e.g.
   * "Oct 3 to Dec 31, 2026; today is Oct 3; 89 days remaining". Defaults to `describeTimeline()`.
   */
  label?: string;
  /** Optional visible caption over the today marker, e.g. "Today". */
  todayLabel?: string;
  /** Optional visible caption at the payout end, e.g. "Dec 31". */
  payoutLabel?: string;
  className?: string;
}

/** Narrowest month segment (fraction of the track) that still gets a visible label. */
const MIN_LABELLED_SEGMENT = 0.07;
/** Hide the today caption when it would run into the payout caption. */
const CAPTION_COLLISION = 0.28;

/**
 * Slim horizontal timeline from period start to payout: elapsed track in lavender, month ticks
 * with short labels, a today marker, and a copper end-cap for the payout date. Decorative SVG plus
 * a visually hidden sentence that carries the same information.
 */
export function PeriodTimeline({ start, end, today, payoutDate, label, todayLabel, payoutLabel, className }: PeriodTimelineProps) {
  const segments = monthSegments(start, end);
  const boundaries = monthBoundaries(segments);
  const t = dateFraction(today, start, end);
  const p = dateFraction(payoutDate, start, end);
  const text = label ?? describeTimeline({ start, end, today, payoutDate });

  const hasTopRow = Boolean(todayLabel || payoutLabel);
  const trackY = hasTopRow ? 28 : 12;
  const monthY = trackY + 22;
  const showTodayCaption = Boolean(todayLabel) && !(payoutLabel && p - t < CAPTION_COLLISION);
  const todayAnchor = t < 0.08 ? 'start' : t > 0.92 ? 'end' : 'middle';

  return (
    <div className={[styles.viz, styles.timeline, segments.length > 6 ? styles.manyMonths : '', className].filter(Boolean).join(' ')}>
      <p className={styles.srOnly}>{text}</p>
      <svg
        className={[styles.timelineSvg, hasTopRow ? styles.timelineSvgWithLabel : ''].join(' ')}
        aria-hidden="true"
        focusable="false"
      >
        {/* Track: remaining (quiet) under elapsed (lavender). */}
        <line x1="0%" x2="100%" y1={trackY} y2={trackY} className={styles.trackRest} />
        {t > 0 && <line x1="0%" x2={pct(t)} y1={trackY} y2={trackY} className={styles.trackDone} />}

        {/* Month boundaries. */}
        <line x1="0%" x2="0%" y1={trackY - 4} y2={trackY + 4} className={styles.tick} />
        {boundaries.map((b) => (
          <line key={b} x1={pct(b)} x2={pct(b)} y1={trackY - 4} y2={trackY + 4} className={styles.tick} />
        ))}

        {/* Month labels, centred in their segment. */}
        {segments.map((m) =>
          m.end - m.start >= MIN_LABELLED_SEGMENT ? (
            <text key={m.key} x={pct(m.center)} y={monthY} textAnchor="middle" className={styles.svgText}>
              <tspan className={styles.labelWide}>{m.label}</tspan>
              <tspan className={styles.labelNarrow}>{m.narrowLabel}</tspan>
            </text>
          ) : null,
        )}

        {/* Payout end-cap (copper). */}
        <circle cx={pct(p)} cy={trackY} r={7} className={styles.ringCopper} />
        <circle cx={pct(p)} cy={trackY} r={3.5} className={styles.dotCopper} />

        {/* Today marker. */}
        <circle cx={pct(t)} cy={trackY} r={8} className={styles.halo} />
        <circle cx={pct(t)} cy={trackY} r={4} className={styles.dotAccent} />

        {showTodayCaption && (
          <text x={pct(t)} y={12} textAnchor={todayAnchor} className={[styles.svgText, styles.svgTextStrong].join(' ')}>
            {todayLabel}
          </text>
        )}
        {payoutLabel && (
          <text x="100%" y={12} textAnchor="end" className={[styles.svgText, styles.svgTextStrong].join(' ')}>
            {payoutLabel}
          </text>
        )}
      </svg>
    </div>
  );
}
