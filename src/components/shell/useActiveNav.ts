"use client";

import { usePathname } from "next/navigation";
import { navKeyForPath, type NavKey } from "./nav";

/** Explicit `activeNav` wins; otherwise derive from the current pathname. */
export function useActiveNav(activeNav?: NavKey): NavKey | undefined {
  const pathname = usePathname();
  return activeNav ?? navKeyForPath(pathname);
}
