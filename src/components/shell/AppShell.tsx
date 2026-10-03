import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { BottomNav } from "./BottomNav";
import { NavRail } from "./NavRail";
import type { NavKey } from "./nav";
import { SkipLink } from "./SkipLink";
import { TopBar } from "./TopBar";

export interface AppShellProps {
  children: ReactNode;
  /** Highlighted nav item. When omitted it is derived from the pathname. */
  activeNav?: NavKey;
  user?: { email: string };
  /** Sign-out control (e.g. `<form action={signOut}><SignOutButton /></form>`), shown in rail, top bar and "More". */
  signOutSlot?: ReactNode;
  /** Centered mobile "Add" control (e.g. <AddActionButton onClick={...} />). */
  addAction?: ReactNode;
}

/**
 * Authenticated app frame. Purely presentational: no data fetching, no server imports.
 * ≥1200px navigation rail · 768–1199px top bar · <768px bottom nav. Main region is max ~1320px.
 */
export function AppShell({ children, activeNav, user, signOutSlot, addAction }: AppShellProps) {
  return (
    <div className="min-h-dvh">
      <SkipLink />
      <NavRail activeNav={activeNav} user={user} signOutSlot={signOutSlot} />
      <TopBar activeNav={activeNav} user={user} signOutSlot={signOutSlot} />
      <div className="flex h-14 items-center px-4 md:hidden">
        <Link href="/" className="rounded-control py-1" aria-label="Tenth, go to Overview">
          <Logo size={24} withWordmark />
        </Link>
      </div>
      <div className="desk:pl-[var(--rail-w)]">
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[var(--content-max)] px-4 pb-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom,0px)+32px)] pt-2 outline-none md:px-8 md:pb-16 md:pt-8 desk:px-12 desk:pt-10"
        >
          {children}
        </main>
      </div>
      <BottomNav activeNav={activeNav} user={user} signOutSlot={signOutSlot} addAction={addAction} />
    </div>
  );
}
