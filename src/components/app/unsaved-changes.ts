"use client";

import { useEffect } from "react";

/**
 * A small client registry of forms with unsaved input. Forms register while they are dirty (see
 * {@link useUnsavedChanges}); the app-level {@link LeaveGuard} asks before an in-app link or sign-out would drop
 * that input. Reloads and tab closes keep using the browser's own beforeunload prompt.
 */
const dirtyForms = new Set<symbol>();

/** The question asked before in-app navigation drops unsaved input. */
export const LEAVE_PROMPT = "You have unsaved changes. Leave without saving?";

/** True while any registered form has unsaved input. */
export function hasUnsavedChanges(): boolean {
  return dirtyForms.size > 0;
}

/** Registers one dirty form and returns its unregister function. */
export function registerUnsavedChanges(): () => void {
  const token = Symbol("dirty-form");
  dirtyForms.add(token);
  return () => {
    dirtyForms.delete(token);
  };
}

/** Asks before leaving when something is unsaved. Returns true when it is fine to go on. */
export function confirmLeave(confirm: (message: string) => boolean = (message) => window.confirm(message)): boolean {
  return !hasUnsavedChanges() || confirm(LEAVE_PROMPT);
}

/**
 * While `dirty`: registers the form with the in-app leave guard and asks the browser to warn before a reload or tab
 * close (beforeunload). Pass `dirty && open` for forms inside dialogs, so a closed dialog never blocks navigation.
 */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const unregister = registerUnsavedChanges();
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);
}

/** The parts of a click that decide whether it navigates the current tab. */
export interface ClickFacts {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/** The parts of a link that decide where it goes. `href` is the resolved absolute URL (`anchor.href`). */
export interface LinkFacts {
  href: string;
  target: string;
  download: boolean;
}

/**
 * True when clicking this link would replace the current page inside the app (client-side navigation), so unsaved
 * input would be lost without the browser asking. Not guarded: clicks already handled, new-tab/window clicks
 * (modifier keys, middle button, a target), downloads, in-page anchors and the current URL itself, and links to
 * other sites (a full page load, where the browser's beforeunload prompt applies).
 */
export function isInAppNavigation(click: ClickFacts, link: LinkFacts, current: string): boolean {
  if (click.defaultPrevented || click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if ((link.target && link.target !== "_self") || link.download) return false;
  let to: URL;
  let from: URL;
  try {
    to = new URL(link.href);
    from = new URL(current);
  } catch {
    return false;
  }
  if (to.origin !== from.origin) return false;
  return to.pathname !== from.pathname || to.search !== from.search;
}
