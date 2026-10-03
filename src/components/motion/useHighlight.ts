'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './motion.module.css';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export const HIGHLIGHT_MS = 1600;
/** Under reduced motion the static outline lingers a little longer, since it does not fade. */
const STATIC_HIGHLIGHT_MS = 2400;

/**
 * Brief "just saved" emphasis for one row in a list. Pass the id of the row that was just added or
 * changed (e.g. from the action result); the returned function gives that row a class with a ~1.6s
 * lavender wash that fades out (a static outline, without fading, under reduced motion) and gives
 * every other row ''. Pass a new `token` to highlight the same id again (e.g. after a second edit).
 * Pair it with a polite live-region message ("Saved") - the highlight is never the only signal.
 */
export function useHighlight(highlightId: string | null | undefined, token?: string | number): (rowId: string) => string {
  const reduced = usePrefersReducedMotion();
  const key = highlightId ? `${highlightId}\u0000${token ?? ''}` : null;
  const [expiredKey, setExpiredKey] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => setExpiredKey(key), reduced ? STATIC_HIGHLIGHT_MS : HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [key, reduced]);

  const activeId = key && key !== expiredKey ? highlightId : null;
  return useCallback(
    (rowId: string) => (activeId && rowId === activeId ? ((reduced ? styles.highlightStatic : styles.highlight) ?? '') : ''),
    [activeId, reduced],
  );
}
