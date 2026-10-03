'use client';

import { ChevronRight } from 'lucide-react';
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { formatLocalDate, formatMinor, toLocalDate, toMinor, type Currency } from '@/domain';
import styles from './charts.module.css';
import { areaPath, roundedPath, stepVertices, type Pt } from './geometry';
import { formatMinorDisplay, formatTick, linearScale, niceScale } from './scale';
import { mergeSeries, nearestIndex, seriesExtent, stepIndex, type InspectPoint, type SeriesPointLike } from './series';
import { dateFraction, monthBoundaries, monthSegments } from './timeline';

/** Structural subset of the domain `CumulativeSeries`; pass `overview.chart` directly. */
export interface CumulativeChartSeries {
  currency: Currency;
  range: { start: string; end: string; label: string };
  accrued: readonly SeriesPointLike[];
  given: readonly SeriesPointLike[];
  startValueMinor: number;
  maxMinor: number;
}

export interface CumulativeChartProps {
  series: CumulativeChartSeries;
  /** Today in the owner's time zone (YYYY-MM-DD); draws the today rule when inside the range. */
  today: string;
  /** Default "Accrued tithe". */
  title?: string;
  /** Default "CAD · Oct 3 – Dec 31, 2026" (currency and range are always stated). */
  caption?: string;
  /** Heading level for the title. Default 3. */
  headingLevel?: 2 | 3 | 4;
  /** Series names. Defaults "Accrued" / "Given". */
  accruedLabel?: string;
  givenLabel?: string;
  /** Show the given line (when the series has points). Default true. */
  showGiven?: boolean;
  /** Caption at the range end (payout), e.g. "Payout Dec 31". */
  payoutLabel?: string;
  /** Shown over a faint baseline when there are no points. */
  emptyMessage?: ReactNode;
  className?: string;
}

const DEFAULT_WIDTH = 640;
const PAD_TOP = 26;
const PAD_BOTTOM = 30;
const PAD_RIGHT = 10;
const CORNER = 6;
const TICK_CHAR_PX = 6.6;

function chartHeight(width: number): number {
  return width < 480 ? 196 : 236;
}

/** Tracks an element's content width (CSS px) so the SVG can be drawn 1:1 with crisp 11px text. */
function useMeasuredWidth<T extends HTMLElement>(initial: number) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function money(minor: number): string {
  return formatMinorDisplay(minor);
}

/** Plain text for the live region (screen readers read the hyphen as "minus"). */
function spoken(minor: number): string {
  return formatMinor(toMinor(minor));
}

function dateLabel(date: string, style: 'short' | 'medium' = 'medium'): string {
  return formatLocalDate(toLocalDate(date), style);
}

function LineKey({ kind }: { kind: 'accrued' | 'given' }) {
  return (
    <svg className={styles.legendKey} aria-hidden="true" focusable="false">
      <line x1="1" x2="15" y1="3" y2="3" className={kind === 'accrued' ? styles.lineAccent : styles.lineGiven} />
    </svg>
  );
}

/**
 * Cumulative accrued tithe over the period as a softly rounded step line with a gradient wash,
 * plus an optional lower-emphasis "given" line. Inspectable by pointer and keyboard (arrow keys,
 * Home/End); every value is also available in a "Show data table" disclosure.
 */
export function CumulativeChart({
  series,
  today,
  title = 'Accrued tithe',
  caption,
  headingLevel = 3,
  accruedLabel = 'Accrued',
  givenLabel = 'Given',
  showGiven = true,
  payoutLabel,
  emptyMessage,
  className,
}: CumulativeChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [boxRef, width] = useMeasuredWidth<HTMLDivElement>(DEFAULT_WIDTH);
  const [selected, setSelected] = useState(-1);
  const [announcement, setAnnouncement] = useState('');

  const { currency, range } = series;
  const meta = caption ?? `${currency} · ${range.label}`;
  const Heading = `h${headingLevel}` as const;
  const hasGiven = showGiven && series.given.length > 0;
  const isEmpty = series.accrued.length === 0;

  const points: InspectPoint[] = useMemo(
    () => mergeSeries(series.accrued, hasGiven ? series.given : [], { accruedStart: series.startValueMinor }),
    [series.accrued, series.given, series.startValueMinor, hasGiven],
  );

  const height = chartHeight(width);
  const extent = seriesExtent(points, [series.maxMinor, series.startValueMinor]);
  const scale = niceScale(extent.min, extent.max);
  const tickLabels = scale.ticks.map((v) => formatTick(v, scale.step));
  const gutter = Math.ceil(Math.max(...tickLabels.map((l) => l.length)) * TICK_CHAR_PX) + 14;
  const x0 = gutter;
  const x1 = Math.max(x0 + 40, width - PAD_RIGHT);
  const yTop = PAD_TOP;
  const yBottom = height - PAD_BOTTOM;
  const y = linearScale(scale.min, scale.max, yBottom, yTop);
  const xOf = (date: string) => x0 + dateFraction(date, range.start, range.end) * (x1 - x0);
  const yZero = y(0);

  const accruedVerts: Pt[] = stepVertices(series.accrued.map((p) => ({ x: xOf(p.date), y: y(p.valueMinor) })));
  const givenVerts: Pt[] = hasGiven ? stepVertices(series.given.map((p) => ({ x: xOf(p.date), y: y(p.valueMinor) }))) : [];
  const xs = points.map((p) => xOf(p.date));

  const segments = monthSegments(range.start, range.end);
  const boundaries = monthBoundaries(segments);
  const todayInside = !isEmpty && today >= range.start && today < range.end;
  const xToday = todayInside ? xOf(today) : null;
  const showTodayCaption = xToday !== null && (!payoutLabel || x1 - xToday > 120) && xToday - x0 > 18;

  const last = points[points.length - 1];
  const active = selected >= 0 ? points[selected] : last;
  const lastAccrued = accruedVerts[accruedVerts.length - 1];
  const lastGiven = givenVerts[givenVerts.length - 1];

  const describe = useCallback(
    (p: InspectPoint) =>
      `${dateLabel(p.date)}: ${accruedLabel.toLowerCase()} ${currency} ${spoken(p.accruedMinor)}` +
      (p.givenMinor !== null ? `, ${givenLabel.toLowerCase()} ${currency} ${spoken(p.givenMinor)}` : ''),
    [accruedLabel, givenLabel, currency],
  );

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = (e.clientX - rect.left) * (width / rect.width);
    const i = nearestIndex(xs, x);
    if (i !== selected) setSelected(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setSelected(-1);
      return;
    }
    const next = stepIndex(selected, e.key, points.length);
    if (next === null) return;
    e.preventDefault();
    setSelected(next);
    const p = points[next];
    if (p) setAnnouncement(describe(p));
  };

  const plotLabel = `${title}, ${currency}, ${range.label}`;
  const hintId = `${uid}-hint`;
  const areaId = `${uid}-area`;

  return (
    <figure className={[styles.viz, styles.figure, className].filter(Boolean).join(' ')}>
      <figcaption className={styles.chartHeader}>
        <div>
          <Heading className={styles.chartTitle}>{title}</Heading>
          <p className={styles.chartMeta}>{meta}</p>
        </div>
        {!isEmpty && active && (
          <div className={styles.readout} aria-hidden="true">
            <div className={styles.readoutCell}>
              <span className={styles.readoutValue}>{dateLabel(active.date, 'short')}</span>
              <span className={styles.readoutLabel}>{selected >= 0 ? 'Selected' : 'Latest'}</span>
            </div>
            <div className={styles.readoutCell}>
              <span className={styles.readoutValue}>
                <span className={styles.readoutCode}>{currency}</span>
                {money(active.accruedMinor)}
              </span>
              <span className={styles.readoutLabel}>
                {hasGiven && <LineKey kind="accrued" />}
                {accruedLabel}
              </span>
            </div>
            {hasGiven && active.givenMinor !== null && (
              <div className={styles.readoutCell}>
                <span className={styles.readoutValue}>
                  <span className={styles.readoutCode}>{currency}</span>
                  {money(active.givenMinor)}
                </span>
                <span className={styles.readoutLabel}>
                  <LineKey kind="given" />
                  {givenLabel}
                </span>
              </div>
            )}
          </div>
        )}
      </figcaption>

      <div
        ref={boxRef}
        className={styles.plot}
        {...(isEmpty
          ? {}
          : {
              tabIndex: 0,
              role: 'group',
              'aria-roledescription': 'chart',
              'aria-label': plotLabel,
              'aria-describedby': hintId,
              onKeyDown,
              onPointerMove: onPointer,
              onPointerDown: onPointer,
              onPointerLeave: () => setSelected(-1),
              onFocus: () => {
                if (selected < 0 && last) setAnnouncement(describe(last));
              },
              onBlur: () => {
                setSelected(-1);
                setAnnouncement('');
              },
            })}
      >
        <svg
          className={styles.plotSvg}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className={styles.stopAccent} stopOpacity={0.2} />
              <stop offset="0.7" className={styles.stopAccent} stopOpacity={0.05} />
              <stop offset="1" className={styles.stopAccent} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Grid + y ticks */}
          {!isEmpty &&
            scale.ticks.map((v, i) => (
              <g key={v}>
                <line x1={x0} x2={x1} y1={Math.round(y(v)) + 0.5} y2={Math.round(y(v)) + 0.5} className={v === 0 ? styles.axis : styles.grid} />
                <text x={x0 - 10} y={y(v) + 3.5} textAnchor="end" className={styles.svgText}>
                  {tickLabels[i]}
                </text>
              </g>
            ))}

          {isEmpty && <line x1={x0} x2={x1} y1={yBottom} y2={yBottom} className={styles.emptyBaseline} />}

          {/* Month boundaries and labels */}
          {boundaries.map((b) => {
            const bx = Math.round(x0 + b * (x1 - x0)) + 0.5;
            return <line key={b} x1={bx} x2={bx} y1={yBottom} y2={yBottom + 5} className={styles.axis} />;
          })}
          {segments.map((m) =>
            (m.end - m.start) * (x1 - x0) >= 26 ? (
              <text
                key={m.key}
                x={x0 + m.center * (x1 - x0)}
                y={height - 9}
                textAnchor="middle"
                className={styles.svgText}
              >
                {(m.end - m.start) * (x1 - x0) >= 40 ? m.label : m.narrowLabel}
              </text>
            ) : null,
          )}

          {/* Today rule */}
          {xToday !== null && (
            <>
              <line
                x1={Math.round(xToday) + 0.5}
                x2={Math.round(xToday) + 0.5}
                y1={yTop - 8}
                y2={yBottom}
                className={styles.todayRule}
              />
              {showTodayCaption && (
                <text x={xToday} y={12} textAnchor="middle" className={[styles.svgText, styles.svgTextStrong].join(' ')}>
                  Today
                </text>
              )}
            </>
          )}

          {/* Payout end marker */}
          <circle cx={x1} cy={yZero} r={6} className={styles.ringCopper} />
          <circle cx={x1} cy={yZero} r={3} className={styles.dotCopper} />
          {payoutLabel && (
            <text x={x1 + 4} y={12} textAnchor="end" className={[styles.svgText, styles.svgTextStrong].join(' ')}>
              {payoutLabel}
            </text>
          )}

          {/* Series */}
          {!isEmpty && (
            <>
              <path d={areaPath(accruedVerts, CORNER, yZero)} fill={`url(#${areaId})`} className={styles.area} />
              {hasGiven && <path d={roundedPath(givenVerts, CORNER)} className={styles.lineGiven} />}
              <path d={roundedPath(accruedVerts, CORNER)} className={styles.lineAccent} />
            </>
          )}

          {/* Inspection layer */}
          {!isEmpty && selected >= 0 && active && (
            <>
              <line
                x1={Math.round(xs[selected]!) + 0.5}
                x2={Math.round(xs[selected]!) + 0.5}
                y1={yTop - 8}
                y2={yBottom}
                className={styles.crosshair}
              />
              {active.givenMinor !== null && <circle cx={xs[selected]} cy={y(active.givenMinor)} r={3.5} className={styles.dotGiven} />}
              <circle cx={xs[selected]} cy={y(active.accruedMinor)} r={4.5} className={styles.dotAccent} />
            </>
          )}
          {!isEmpty && selected < 0 && (
            <>
              {lastGiven && <circle cx={lastGiven.x} cy={lastGiven.y} r={3} className={styles.dotGiven} />}
              {lastAccrued && <circle cx={lastAccrued.x} cy={lastAccrued.y} r={4} className={styles.dotAccent} />}
            </>
          )}
        </svg>

        {isEmpty && emptyMessage ? <div className={styles.emptyMessage}>{emptyMessage}</div> : null}
      </div>

      {!isEmpty && (
        <>
          <p id={hintId} className={styles.srOnly}>
            Use the left and right arrow keys to step through dates, Home and End to jump to the first or last date.
          </p>
          <div className={styles.srOnly} aria-live="polite" aria-atomic="true">
            {announcement}
          </div>
          <details className={styles.disclosure}>
            <summary>
              <ChevronRight size={14} className={styles.chevron} aria-hidden="true" />
              Show data table
            </summary>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <caption className={styles.srOnly}>
                  {title} · {meta}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">
                      {accruedLabel} ({currency})
                    </th>
                    {hasGiven && (
                      <th scope="col">
                        {givenLabel} ({currency})
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.date}>
                      <th scope="row">{dateLabel(p.date)}</th>
                      <td>{money(p.accruedMinor)}</td>
                      {hasGiven && <td>{p.givenMinor === null ? '—' : money(p.givenMinor)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </figure>
  );
}
