"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { NAV_ITEMS, type NavKey } from "./nav";

const MORE_KEYS: readonly NavKey[] = ["set-aside", "settings"];

export interface MoreMenuProps {
  active?: NavKey;
  user?: { email: string };
  signOutSlot?: ReactNode;
}

/**
 * "More" in the mobile bottom nav: a disclosure (navigation, so not role="menu") holding Set aside,
 * Settings and Sign out. Esc and outside clicks close it and focus returns to the button.
 */
export function MoreMenu({ active, user, signOutSlot }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  const items = NAV_ITEMS.filter((i) => MORE_KEYS.includes(i.key));
  const sectionActive = active !== undefined && MORE_KEYS.includes(active);
  const activeLabel = items.find((i) => i.key === active)?.label;

  // Close after navigation.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>("[data-more-panel] a, [data-more-panel] button")?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative h-full">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-control text-[0.6875rem] font-medium leading-none",
          sectionActive || open ? "text-accent" : "text-text-2",
        )}
      >
        {sectionActive ? <span aria-hidden="true" className="absolute top-0 h-0.5 w-6 rounded-b-full bg-accent" /> : null}
        <Ellipsis aria-hidden="true" className="size-[22px]" strokeWidth={1.75} />
        <span>More</span>
        {sectionActive && activeLabel ? <span className="sr-only">, current section: {activeLabel}</span> : null}
      </button>
      <div
        id={panelId}
        data-more-panel
        hidden={!open}
        className="fixed bottom-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom,0px)+8px)] right-3 z-50 w-64 animate-reveal rounded-panel border border-line-strong bg-surface-raised p-2 shadow-menu"
      >
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === active;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-[0.875rem]",
                    isActive ? "bg-accent-wash text-accent" : "text-text hover:bg-surface-hover",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {user || signOutSlot ? <div className="mx-1 my-2 h-px bg-line" /> : null}
        {user ? <p className="truncate px-3 pb-1 text-xs text-text-3">Signed in as {user.email}</p> : null}
        {signOutSlot ? (
          <div data-ctx="menu" className="group/slot">
            {signOutSlot}
          </div>
        ) : null}
      </div>
    </div>
  );
}
