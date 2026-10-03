"use client";

import { useEffect, useState } from "react";

import { cn } from "@/components/ui";

import { SETTINGS_SECTIONS, type SettingsSectionId } from "./sections";

/**
 * In-page navigation for Settings: a sticky vertical list beside the sections on desktop, a scrollable row of
 * chips above them on smaller screens. The section in view is marked with aria-current and a lavender indicator.
 */
export function SettingsNav() {
  const [active, setActive] = useState<SettingsSectionId>(SETTINGS_SECTIONS[0].id);

  useEffect(() => {
    const targets = SETTINGS_SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0 || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = SETTINGS_SECTIONS.find((s) => visible.has(s.id));
        if (first) setActive(first.id);
      },
      // A band across the upper part of the viewport decides which section is "current".
      { rootMargin: "-15% 0px -60% 0px" },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Settings sections" className="min-w-0 desk:sticky desk:top-8 desk:self-start">
      <p className="eyebrow mb-3 hidden desk:block">On this page</p>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 desk:flex-col desk:gap-0.5 desk:overflow-visible desk:pb-0">
        {SETTINGS_SECTIONS.map((section) => {
          const current = section.id === active;
          return (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                aria-current={current ? "location" : undefined}
                onClick={() => setActive(section.id)}
                className={cn(
                  "relative flex h-11 items-center whitespace-nowrap text-[0.875rem] transition-colors duration-[var(--dur-fast)] md:h-9",
                  // Chips below desktop, a quiet list with a slim indicator on desktop.
                  "rounded-chip border px-3 desk:rounded-[8px] desk:border-transparent desk:pl-4",
                  current
                    ? "border-accent/40 bg-accent-wash text-text desk:bg-transparent desk:text-accent"
                    : "border-line text-text-2 hover:bg-surface-raised hover:text-text desk:bg-transparent",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-y-2 left-0 hidden w-0.5 rounded-full bg-accent desk:block",
                    current ? "opacity-100" : "opacity-0",
                  )}
                />
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
