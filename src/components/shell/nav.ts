import { HandHeart, LayoutDashboard, List, PiggyBank, Settings, type LucideIcon } from "lucide-react";

export type NavKey = "overview" | "ledger" | "given" | "set-aside" | "settings";

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "overview", label: "Overview", href: "/", icon: LayoutDashboard },
  { key: "ledger", label: "Ledger", href: "/ledger", icon: List },
  { key: "given", label: "Given", href: "/given", icon: HandHeart },
  { key: "set-aside", label: "Set aside", href: "/set-aside", icon: PiggyBank },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings },
];

/** Which nav item a pathname belongs to. */
export function navKeyForPath(pathname: string | null): NavKey | undefined {
  if (!pathname) return undefined;
  if (pathname === "/") return "overview";
  return NAV_ITEMS.find((i) => i.href !== "/" && (pathname === i.href || pathname.startsWith(`${i.href}/`)))?.key;
}
