"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/components/ui/cn";
import { NAV_ITEMS, type NavKey } from "./nav";
import { useActiveNav } from "./useActiveNav";

export interface TopBarProps {
  activeNav?: NavKey;
  user?: { email: string };
  signOutSlot?: ReactNode;
}

/** Tablet (768–1199px) top bar with a compact horizontal nav. */
export function TopBar({ activeNav, user, signOutSlot }: TopBarProps) {
  const active = useActiveNav(activeNav);
  return (
    <header className="sticky top-0 z-30 hidden h-[var(--topbar-h)] items-center gap-4 border-b border-line bg-bg px-6 md:flex desk:hidden">
      <Link href="/" className="shrink-0 rounded-control py-1" aria-label="Tenth, go to Overview">
        <Logo size={24} withWordmark />
      </Link>
      <nav aria-label="Primary" className="min-w-0 flex-1">
        <ul className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-10 items-center gap-1.5 rounded-control px-2.5 text-label font-medium transition-colors duration-[var(--dur-fast)]",
                    isActive ? "bg-accent-wash text-accent" : "text-text-2 hover:bg-surface hover:text-text",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" strokeWidth={isActive ? 2 : 1.75} />
                  {item.label}
                  {isActive ? (
                    <span aria-hidden="true" className="absolute inset-x-2.5 -bottom-[9px] h-0.5 rounded-full bg-accent" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        {user ? <span className="hidden max-w-44 truncate text-xs text-text-3 lg:inline">{user.email}</span> : null}
        {signOutSlot ? (
          <div data-ctx="bar" className="group/slot">
            {signOutSlot}
          </div>
        ) : null}
      </div>
    </header>
  );
}
