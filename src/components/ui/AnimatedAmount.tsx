"use client";

import { useEffect, useRef, useState } from "react";
import { Amount, type AmountProps } from "./Amount";

export interface AnimatedAmountProps extends AmountProps {
  /** Transition length in ms (default 500, ease-out). Instant with prefers-reduced-motion. */
  durationMs?: number;
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

/**
 * Amount that eases from its previous value to the new one after a confirmed change.
 * Intermediate frames are whole minor units (rounded integers); the final frame is exactly `minor`.
 * Tabular digits keep the width stable. Screen readers only ever get the final value.
 */
export function AnimatedAmount({ minor, durationMs = 500, ...rest }: AnimatedAmountProps) {
  const [shown, setShown] = useState(minor);
  const fromRef = useRef(minor);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === minor) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || durationMs <= 0) {
      fromRef.current = minor;
      frameRef.current = requestAnimationFrame(() => setShown(minor));
      return () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      };
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const value = t >= 1 ? minor : Math.round(from + (minor - from) * easeOutCubic(t));
      setShown(value);
      fromRef.current = value;
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [minor, durationMs]);

  return (
    <span className="relative inline-flex">
      <span aria-hidden="true" className="inline-flex">
        <Amount minor={shown} {...rest} />
      </span>
      <Amount minor={minor} {...rest} className="sr-only" />
    </span>
  );
}
