/**
 * The side menu's items (components/sidebar.tsx) and which one is the current
 * screen. Pure, so the shells and the tests share it.
 */
import type { IconName } from "@/components/ui/icons";

export interface SidebarItem {
  label: string;
  href: string;
  icon: IconName;
  /** Other paths that belong to this item (and their subpages). */
  also?: string[];
  /** Only this exact path, not its subpages (an area's home, e.g. /admin). */
  exact?: boolean;
}

/** Is this item the current screen? Its own path or any page under it. */
export function isItemActive(item: Pick<SidebarItem, "href" | "also" | "exact">, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(p + "/"));
}
