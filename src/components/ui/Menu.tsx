"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { cn } from "./cn";

export interface MenuItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Action. Runs after the menu closes and focus is back on the trigger (so a dialog can return focus there). */
  onSelect?: () => void;
  /** Navigate instead of running an action. */
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}

export type MenuEntry = MenuItem | "separator";

export interface MenuProps {
  /** Accessible name of the trigger, e.g. "Actions for income on Oct 3". */
  label: string;
  items: readonly MenuEntry[];
  /** Visible trigger content; defaults to an ellipsis icon (icon-only button named by `label`). */
  trigger?: ReactNode;
  align?: "start" | "end";
  placement?: "bottom" | "top";
  triggerClassName?: string;
  className?: string;
}

/**
 * Action menu (button + role="menu"). Enter/Space/ArrowDown open on the first item, ArrowUp on the last;
 * arrows, Home/End and type-ahead move; Esc or an outside click closes; Tab closes and moves on.
 */
export function Menu({ label, items, trigger, align = "end", placement = "bottom", triggerClassName, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<"first" | "last" | null>(null);
  const menuId = useId();

  const itemEls = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  useEffect(() => {
    if (!open) return;
    const els = itemEls();
    const target = pendingFocus.current === "last" ? els[els.length - 1] : els[0];
    target?.focus();
    pendingFocus.current = null;

    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const openWith = (where: "first" | "last") => {
    pendingFocus.current = where;
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openWith("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openWith("last");
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = itemEls();
    const idx = els.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => els[(i + els.length) % els.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(idx + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(idx - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(els.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const ch = e.key.toLowerCase();
          const order = [...els.slice(idx + 1), ...els.slice(0, idx + 1)];
          order.find((el) => el.textContent?.trim().toLowerCase().startsWith(ch))?.focus();
        }
    }
  };

  const activate = (item: MenuItem) => {
    if (item.disabled) return;
    close(true);
    item.onSelect?.();
  };

  const itemClass = (item: MenuItem) =>
    cn(
      "flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-left text-[0.875rem] outline-none md:min-h-9",
      "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
      "[&_svg]:size-4 [&_svg]:shrink-0",
      item.disabled
        ? "cursor-not-allowed opacity-50"
        : item.danger
          ? "text-danger hover:bg-danger-wash focus:bg-danger-wash"
          : "text-text hover:bg-surface-hover focus:bg-surface-hover",
    );

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={trigger ? undefined : label}
        onClick={() => (open ? close(false) : openWith("first"))}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-control text-text-2 transition-colors hover:bg-surface-raised hover:text-text",
          "aria-expanded:bg-surface-raised aria-expanded:text-text",
          trigger ? "h-11 px-3 text-[0.875rem] font-medium md:h-9" : "size-11 md:size-9 [&_svg]:size-[18px]",
          triggerClassName,
        )}
      >
        {trigger ?? <Ellipsis aria-hidden="true" />}
      </button>
      {open ? (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute z-50 min-w-48 animate-reveal rounded-control border border-line-strong bg-surface-raised p-1 shadow-menu",
            align === "end" ? "right-0" : "left-0",
            placement === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
          )}
        >
          {items.map((entry, i) =>
            entry === "separator" ? (
              <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-line" />
            ) : entry.href && !entry.disabled ? (
              <Link
                key={entry.id}
                href={entry.href}
                role="menuitem"
                tabIndex={-1}
                className={itemClass(entry)}
                onClick={() => setOpen(false)}
              >
                {entry.icon ? <span aria-hidden="true" className="inline-flex">{entry.icon}</span> : null}
                {entry.label}
              </Link>
            ) : (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={entry.disabled || undefined}
                className={itemClass(entry)}
                onClick={() => activate(entry)}
              >
                {entry.icon ? <span aria-hidden="true" className="inline-flex">{entry.icon}</span> : null}
                {entry.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
