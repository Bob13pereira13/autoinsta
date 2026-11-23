"use client";

/**
 * The admin area: the same frame and side menu as the client's dashboard
 * (components/app-shell.tsx), with its own items, the "Admin area" badge next
 * to the logo and, at the bottom, the admin's e-mail and the way back to the
 * dashboard.
 */

import Link from "next/link";
import AppShell from "@/components/app-shell";
import type { SidebarItem } from "@/components/sidebar-items";
import { useI18n } from "@/lib/i18n/provider";

export default function AdminShell({ children, adminEmail }: { children: React.ReactNode; adminEmail: string }) {
  const { t } = useI18n();
  // A new client is created from the Clients page (its button at the top).
  const items: SidebarItem[] = [
    { label: t("Overview"), href: "/admin", icon: "dashboard", exact: true },
    { label: t("Clients"), href: "/admin/clients", icon: "users" },
    { label: t("Diagnostics"), href: "/admin/diagnostics", icon: "diagnostics" },
    { label: t("Settings"), href: "/admin/settings", icon: "settings" },
  ];
  return (
    <AppShell
      items={items}
      homeHref="/admin"
      badge={t("Admin area")}
      identity={{
        name: adminEmail,
        detail: (
          <Link href="/dashboard" className="text-xs font-medium text-accent-fg hover:text-accent-fg-hover">
            {t("Back to the dashboard")}
          </Link>
        ),
      }}
    >
      {children}
    </AppShell>
  );
}
