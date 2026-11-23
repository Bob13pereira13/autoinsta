"use client";

/**
 * Side menu, shared by the client's dashboard and the admin area: brand (and,
 * in the admin area, its badge), the screens (stroke icons, the active one
 * tinted, also on their subpages), and at the bottom who is signed in,
 * language, theme and sign out. On phones it is a drawer: it slides in over
 * the page, Esc or a tap outside closes it, and Tab stays inside it while it
 * is open. What goes in it comes from the shell (components/dashboard-shell.tsx,
 * components/admin/admin-shell.tsx).
 */

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import LanguageSwitcher from "@/components/language-switcher";
import BrandMark from "@/components/brand-mark";
import { signOutAction } from "@/lib/auth-actions";
import { useI18n } from "@/lib/i18n/provider";
import { NavItem } from "@/components/ui/nav-item";
import ThemeToggle from "@/components/ui/theme-toggle";
import { Icon } from "@/components/ui/icons";
import { isItemActive, type SidebarItem } from "@/components/sidebar-items";
import { buttonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";

/** Who is signed in: the round initials, the name, and a line below it. */
export interface SidebarIdentity {
  name: string;
  detail?: ReactNode;
}

export interface SidebarConfig {
  items: SidebarItem[];
  /** Where the logo leads. */
  homeHref: string;
  /** A pill next to the logo, e.g. "Admin area". */
  badge?: string;
  identity: SidebarIdentity;
}

interface SidebarProps extends SidebarConfig {
  isOpen: boolean;
  onClose: () => void;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase() || "•";
}

/** The area's badge, e.g. "Admin area" (also in the phone's top bar). */
export function AreaBadge({ children }: { children: ReactNode }) {
  return (
    <span data-area-badge className="whitespace-nowrap rounded-full border border-accent-soft-border bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-soft-fg">
      {children}
    </span>
  );
}

export default function Sidebar({ isOpen, onClose, items, homeHref, badge, identity }: SidebarProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const aside = useRef<HTMLElement>(null);

  // Drawer (phones): focus the first link when it opens, Esc closes it and
  // Tab cycles inside it.
  useEffect(() => {
    if (!isOpen) return;
    const panel = aside.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>("a, button, select")).filter((el) => !el.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  return (
    <>
      {isOpen && <div aria-hidden="true" className="fixed inset-0 z-40 bg-overlay lg:hidden" onClick={onClose} />}

      <aside
        ref={aside}
        aria-label={t("Menu")}
        className={cx(
          "fixed left-0 top-0 z-50 flex h-dvh w-[260px] max-w-[85vw] shrink-0 flex-col gap-7 border-r border-sidebar-border bg-dialog px-3 pb-4",
          // Solid as a drawer on phones; the translucent sidebar tone from lg up.
          "transition-transform duration-200 ease-out lg:static lg:z-auto lg:h-full lg:translate-x-0 lg:bg-sidebar",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        // The drawer is full height, so the brand would otherwise land under
        // the status bar when installed to the home screen.
        style={{ paddingTop: "calc(1.375rem + env(safe-area-inset-top))" }}
      >
        <div className="flex flex-col items-start gap-0.5 px-2.5 lg:gap-2">
          <div className="flex w-full items-center justify-between gap-2">
            <BrandMark href={homeHref} size="sm" />
            <button type="button" onClick={onClose} className={buttonClass("ghost", "icon", "lg:hidden")} aria-label={t("Close")}>
              <Icon name="close" size={18} />
            </button>
          </div>
          {/* Under the logo: the logo and the badge do not fit side by side in 260 px. */}
          {badge && <AreaBadge>{badge}</AreaBadge>}
        </div>

        <nav aria-label={t("Menu")} className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {items.map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} active={isItemActive(item, pathname)} onClick={onClose} />
          ))}
        </nav>

        <div className="flex flex-col gap-2.5 border-t border-sidebar-border px-1 pt-3.5">
          <div data-sidebar-identity className="flex items-center gap-2.5 px-1.5">
            <span aria-hidden="true" className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-soft-fg">
              {initials(identity.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground" title={identity.name}>
                {identity.name}
              </p>
              {identity.detail}
            </div>
          </div>
          <div className="px-1.5 py-1">
            <LanguageSwitcher />
          </div>
          <ThemeToggle />
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex min-h-[42px] w-full items-center gap-2.5 rounded-item px-3 text-left text-muted transition-colors duration-150 hover:bg-nav-hover hover:text-heading"
            >
              <Icon name="logout" size={18} />
              {t("Sign out")}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
