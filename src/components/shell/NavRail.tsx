"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { cn } from "@/components/ui/cn";
import { NAV_ITEMS, type NavKey } from "./nav";
import { useActiveNav } from "./useActiveNav";

export interface NavRailProps {
  activeNav?: NavKey;
  user?: { email: string };
  signOutSlot?: ReactNode;
}

/** Desktop (≥1200px) navigation rail, ~76px: mark, five items, account + sign out at the bottom. */
export function NavRail({ activeNav, user, signOutSlot }: NavRailProps) {
  const active = useActiveNav(activeNav);
  return (
    <aside
      aria-label="Sidebar"
      className="fixed inset-y-0 left-0 z-30 hidden w-[var(--rail-w)] flex-col items-center border-r border-line bg-bg py-5 desk:flex"
    >
      <Link href="/" className="grid size-11 place-items-center rounded-control" aria-label="Tenth, go to Overview">
        <LogoMark size={28} decorative />
      </Link>
      <nav aria-label="Primary" className="mt-8 w-full px-2">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            const Icon = item.icon;
            return (
              <li key={item.key} className="relative">
                {isActive ? (
                  <span aria-hidden="true" className="absolute -left-2 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                ) : null}
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-control px-1 py-2.5 text-[0.6875rem] font-medium leading-none tracking-[0.01em]",
                    "transition-colors duration-[var(--dur-fast)]",
                    isActive ? "bg-accent-wash text-accent" : "text-text-2 hover:bg-surface hover:text-text",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" strokeWidth={isActive ? 2 : 1.75} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto flex w-full flex-col items-center gap-2 px-2">
        {user ? (
          <span
            className="grid size-8 place-items-center rounded-full border border-line-strong text-xs font-medium uppercase text-text-2"
            title={user.email}
          >
            <span aria-hidden="true">{user.email.slice(0, 1)}</span>
            <span className="sr-only">Signed in as {user.email}</span>
          </span>
        ) : null}
        {signOutSlot ? (
          <div data-ctx="rail" className="group/slot w-full">
            {signOutSlot}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
