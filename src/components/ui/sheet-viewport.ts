"use client";

import { useEffect, type RefObject } from "react";

/** Below this visible height ratio we treat the on-screen keyboard as open (it takes well over a quarter). */
const KEYBOARD_RATIO = 0.8;
/** Smallest gap between the layout and visual viewports that counts as a keyboard (ignores toolbar wobble). */
const KEYBOARD_MIN_PX = 120;

export interface ViewportMetrics {
  /** Layout viewport height (window.innerHeight): what position: fixed is measured against. */
  layoutHeight: number;
  /** Visual viewport height: the part of the page the user can actually see (above the keyboard). */
  visualHeight: number;
  /** Visual viewport offset from the top of the layout viewport (iOS pans it when the keyboard opens). */
  visualOffsetTop: number;
}

export interface SheetPlacement {
  /** Distance from the layout viewport's bottom to the visible area's bottom (the keyboard's top), in px. */
  bottom: number;
  /** Height the sheet may use, in px. */
  height: number;
  keyboardOpen: boolean;
}

/**
 * Where a bottom sheet must sit so that it rests on top of the on-screen keyboard and fits in what is visible.
 * iOS Safari keeps the layout viewport full height while the keyboard is up and only shrinks/pans the visual
 * viewport, so a sheet pinned with `bottom: 0` ends up behind the keyboard. Android Chrome (with
 * interactive-widget=resizes-content) shrinks the layout viewport instead; then `bottom` is simply 0.
 */
export function sheetPlacement({ layoutHeight, visualHeight, visualOffsetTop }: ViewportMetrics): SheetPlacement {
  const bottom = Math.max(0, Math.round(layoutHeight - (visualOffsetTop + visualHeight)));
  const height = Math.max(0, Math.round(visualHeight));
  const keyboardOpen = bottom >= KEYBOARD_MIN_PX || (layoutHeight > 0 && visualHeight < layoutHeight * KEYBOARD_RATIO);
  return { bottom, height, keyboardOpen };
}

/**
 * Keeps an open bottom sheet glued to the visible part of the screen: sets --sheet-bottom / --sheet-height and
 * data-keyboard on the dialog (the CSS in globals.css uses them on phones), and keeps the focused field in view
 * when the keyboard resizes the sheet. No-op where VisualViewport is unavailable.
 */
export function useSheetViewport(ref: RefObject<HTMLDialogElement | null>, active: boolean): void {
  useEffect(() => {
    const dialog = ref.current;
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!active || !dialog || !vv) return;

    let frame = 0;
    const apply = () => {
      frame = 0;
      const placement = sheetPlacement({
        layoutHeight: window.innerHeight,
        visualHeight: vv.height,
        visualOffsetTop: vv.offsetTop,
      });
      dialog.style.setProperty("--sheet-bottom", `${placement.bottom}px`);
      dialog.style.setProperty("--sheet-height", `${placement.height}px`);
      const wasOpen = dialog.dataset.keyboard === "open";
      dialog.dataset.keyboard = placement.keyboardOpen ? "open" : "closed";
      // The sheet just got shorter: bring the field being typed in back into view.
      const focused = document.activeElement;
      if (placement.keyboardOpen && !wasOpen && focused instanceof HTMLElement && dialog.contains(focused)) {
        focused.scrollIntoView({ block: "nearest" });
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      dialog.style.removeProperty("--sheet-bottom");
      dialog.style.removeProperty("--sheet-height");
      delete dialog.dataset.keyboard;
    };
  }, [ref, active]);
}
