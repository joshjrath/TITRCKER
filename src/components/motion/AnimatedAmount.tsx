'use client';

import { useLayoutEffect, useRef } from 'react';
import { formatMoney, splitMinor, toMinor, type Currency } from '@/domain';
import styles from './motion.module.css';
import { AMOUNT_TWEEN_MS, tweenMinor } from './tween';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

/** Typographic minus for display (screen readers get the word "minus"). */
const MINUS = '\u2212';

export interface AnimatedAmountProps {
  /** Integer minor units (e.g. 41250 = 412.50). Same name as the ui Amount's prop. */
  minor: number;
  currency: Currency;
  /** Typographic size. 'hero' is the Still-to-give figure (56-64px mobile, ~88-104px desktop). */
  size?: 'hero' | 'xl' | 'lg' | 'md';
  /**
   * Where the currency code sits. Default: after the figure for 'hero'/'xl' (like the ui Amount),
   * before it otherwise (like formatMoney: "CAD 1,750.00").
   */
  currencyPosition?: 'before' | 'after';
  /** Tween length in ms. Default 500. */
  durationMs?: number;
  className?: string;
}

/**
 * A money figure that, after a confirmed change, counts from the previous value to the new one
 * (~500ms, ease-out) on integer minor units with tabular digits so nothing shifts. It never
 * animates on mount or under reduced motion. Assistive technology only ever gets the final value:
 * the animated digits are aria-hidden and a visually hidden copy holds the settled amount.
 */
/**
 * Hero figures with many digits shrink to fit the width of their container (or the viewport when there is no
 * container) instead of being clipped: one class per length of the whole part ("1,000,000" is 9 characters).
 */
function heroFitClass(whole: string): string {
  if (whole.length >= 12) return styles.fit12 ?? '';
  if (whole.length >= 10) return styles.fit10 ?? '';
  if (whole.length >= 9) return styles.fit9 ?? '';
  if (whole.length >= 7) return styles.fit7 ?? '';
  return '';
}

export function AnimatedAmount({
  minor: valueMinor,
  currency,
  size = 'md',
  currencyPosition = size === 'hero' || size === 'xl' ? 'after' : 'before',
  durationMs = AMOUNT_TWEEN_MS,
  className,
}: AnimatedAmountProps) {
  const reduced = usePrefersReducedMotion();
  const shown = useRef(valueMinor);
  const signRef = useRef<HTMLSpanElement>(null);
  const wholeRef = useRef<HTMLSpanElement>(null);
  const fractionRef = useRef<HTMLSpanElement>(null);
  const final = splitMinor(toMinor(valueMinor));

  useLayoutEffect(() => {
    const write = (v: number) => {
      shown.current = v;
      const parts = splitMinor(toMinor(v));
      if (signRef.current) signRef.current.textContent = parts.sign ? MINUS : '';
      if (wholeRef.current) wholeRef.current.textContent = parts.whole;
      if (fractionRef.current) fractionRef.current.textContent = parts.fraction;
    };
    const from = shown.current;
    const to = valueMinor;
    if (from === to) return;
    if (reduced || durationMs <= 0) {
      write(to);
      return;
    }
    // React has already committed the final digits; paint the starting value before the first frame.
    write(from);
    const t0 = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const v = tweenMinor(from, to, now - t0, durationMs);
      write(v);
      if (v !== to) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [valueMinor, reduced, durationMs]);

  const code = <span className={styles.code}>{currency}</span>;

  return (
    <span className={[styles.amount, styles[size], size === 'hero' ? heroFitClass(final.whole) : '', className].filter(Boolean).join(' ')}>
      <span className={styles.srOnly}>
        {final.sign ? 'minus ' : ''}
        {formatMoney(toMinor(valueMinor), currency, { sign: 'never' })}
      </span>
      <span className={styles.digits} aria-hidden="true">
        {currencyPosition === 'before' && code}
        <span className={styles.number}>
          <span ref={signRef}>{final.sign ? MINUS : ''}</span>
          <span ref={wholeRef}>{final.whole}</span>
          <span className={styles.fraction}>
            .<span ref={fractionRef}>{final.fraction}</span>
          </span>
        </span>
        {currencyPosition === 'after' && code}
      </span>
    </span>
  );
}
