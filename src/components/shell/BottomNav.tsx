"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { MoreMenu } from "./MoreMenu";
import { NAV_ITEMS, type NavKey } from "./nav";
import { useActiveNav } from "./useActiveNav";

export interface BottomNavProps {
  activeNav?: NavKey;
  user?: { email: string };
  signOutSlot?: ReactNode;
  addAction?: ReactNode;
}

const PRIMARY: readonly NavKey[] = ["overview", "ledger"];
const SECONDARY: readonly NavKey[] = ["given"];

function Item({ k, active }: { k: NavKey; active?: NavKey }) {
  const item = NAV_ITEMS.find((i) => i.key === k);
  if (!item) return null;
  const Icon = item.icon;
  const isActive = active === k;
  return (
    <li className="h-full">
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "relative flex h-full flex-col items-center justify-center gap-1 rounded-control text-[0.6875rem] font-medium leading-none",
          isActive ? "text-accent" : "text-text-2",
        )}
      >
        {isActive ? <span aria-hidden="true" className="absolute top-0 h-0.5 w-6 rounded-b-full bg-accent" /> : null}
        <Icon aria-hidden="true" className="size-[22px]" strokeWidth={isActive ? 2 : 1.75} />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}

/** Mobile (<768px) bottom navigation: Overview, Ledger, Add (slot), Given, More. */
export function BottomNav({ activeNav, user, signOutSlot, addAction }: BottomNavProps) {
  const active = useActiveNav(activeNav);
  return (
    <nav
      aria-label="Primary"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg md:hidden"
    >
      <ul className="grid h-[var(--bottomnav-h)] grid-cols-5 px-1">
        {PRIMARY.map((k) => (
          <Item key={k} k={k} active={active} />
        ))}
        <li className="h-full">{addAction ?? null}</li>
        {SECONDARY.map((k) => (
          <Item key={k} k={k} active={active} />
        ))}
        <li className="h-full">
          <MoreMenu active={active} user={user} signOutSlot={signOutSlot} />
        </li>
      </ul>
    </nav>
  );
}
