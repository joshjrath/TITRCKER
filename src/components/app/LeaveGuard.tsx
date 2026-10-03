"use client";

import { useEffect } from "react";
import { confirmLeave, isInAppNavigation } from "./unsaved-changes";

/**
 * App-wide guard for unsaved forms. Listens in the capture phase, before Next's <Link> and React's form actions see
 * the event, and asks before:
 * - an in-app link (nav rail, top bar, bottom nav, "More", links in the page) would replace the current page;
 * - a form marked `data-leaves-page` (sign out) is submitted.
 * Declining cancels the click or submit, so the form and its input stay as they were. Keyboard activation of a link
 * (Enter) dispatches a click, so it is covered too. Renders nothing.
 */
export function LeaveGuard() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor) return;
      const link = { href: anchor.href, target: anchor.target, download: anchor.hasAttribute("download") };
      if (!isInAppNavigation(event, link, window.location.href)) return;
      if (confirmLeave()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-leaves-page")) return;
      if (confirmLeave()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);
  return null;
}
