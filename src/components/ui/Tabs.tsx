"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  panel: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  /** Accessible name of the tab list. */
  label: string;
  items: readonly TabItem<T>[];
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
}

/**
 * Tabs with roving tabindex: one tab stop for the list, arrows/Home/End move focus and select (automatic activation).
 * Works controlled (value + onValueChange) or uncontrolled (defaultValue).
 */
export function Tabs<T extends string>({
  label,
  items,
  value,
  defaultValue,
  onValueChange,
  className,
  listClassName,
  panelClassName,
}: TabsProps<T>) {
  const base = useId();
  const firstEnabled = items.find((i) => !i.disabled)?.value;
  const [inner, setInner] = useState<T | undefined>(defaultValue ?? firstEnabled);
  const selected = value ?? inner;
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  const select = (v: T) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((i) => !i.disabled);
    const idx = enabled.findIndex((i) => i.value === selected);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next === null) return;
    e.preventDefault();
    const target = enabled[next];
    if (!target) return;
    select(target.value);
    tabRefs.current.get(target.value)?.focus();
  };

  const tabId = (v: T) => `${base}-tab-${v}`;
  const panelId = (v: T) => `${base}-panel-${v}`;

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn("flex gap-1 overflow-x-auto border-b border-line", listClassName)}
      >
        {items.map((item) => {
          const isSel = item.value === selected;
          return (
            <button
              key={item.value}
              ref={(el) => {
                if (el) tabRefs.current.set(item.value, el);
                else tabRefs.current.delete(item.value);
              }}
              type="button"
              role="tab"
              id={tabId(item.value)}
              aria-selected={isSel}
              aria-controls={panelId(item.value)}
              tabIndex={isSel ? 0 : -1}
              disabled={item.disabled}
              onClick={() => select(item.value)}
              className={cn(
                "relative -mb-px inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[0.875rem] font-medium",
                "transition-colors duration-[var(--dur-fast)] focus-visible:outline-offset-[-2px] disabled:opacity-50",
                isSel ? "border-accent text-text" : "border-transparent text-text-2 hover:text-text",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.value}
          role="tabpanel"
          id={panelId(item.value)}
          aria-labelledby={tabId(item.value)}
          hidden={item.value !== selected}
          tabIndex={0}
          className={cn("pt-5 focus-visible:outline-offset-4", panelClassName)}
        >
          {item.value === selected ? item.panel : null}
        </div>
      ))}
    </div>
  );
}
