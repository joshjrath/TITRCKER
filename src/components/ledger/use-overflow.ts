"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Whether a single-line (truncated) element currently cuts its text off. Re-measured on resize, so the
 * "Show full text" toggle appears exactly when something is hidden, at any width.
 */
export function useOverflow<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, overflowing];
}

/**
 * Truncated source/note of a ledger row: refs for both single-line previews, whether any text is hidden (cut off,
 * or a multi-line note), and the open state of the full-text panel.
 */
export function useRowText(note: string | null) {
  const [sourceRef, sourceCut] = useOverflow<HTMLSpanElement>();
  const [noteRef, noteCut] = useOverflow<HTMLSpanElement>();
  const [open, setOpen] = useState(false);
  const expandable = open || sourceCut || noteCut || (note?.includes("\n") ?? false);
  return { sourceRef, noteRef, open, expandable, toggle: () => setOpen((o) => !o) };
}
