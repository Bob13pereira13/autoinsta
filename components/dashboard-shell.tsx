"use client";

/** The client's dashboard: the shared frame (components/app-shell.tsx) with the client's menu. */

import AppShell from "@/components/app-shell";
import type { SidebarItem } from "@/components/sidebar-items";
import { useI18n } from "@/lib/i18n/provider";

interface DashboardShellProps {
  children: React.ReactNode;
  workspaceName: string;
  instagramUsername: string | null;
  instagramAccountCount: number;
}

export default function DashboardShell({ children, workspaceName, instagramUsername, instagramAccountCount }: DashboardShellProps) {
  const { t } = useI18n();
  const items: SidebarItem[] = [
    { label: t("Dashboard"), href: "/dashboard", icon: "dashboard" },
    // Editing an automation still lives under /campaigns/..., so that menu item
    // stays highlighted there too.
    { label: t("Automations"), href: "/automations", icon: "automations", also: ["/campaigns"] },
    { label: t("Accounts"), href: "/accounts", icon: "accounts" },
    { label: t("DM Logs"), href: "/logs", icon: "logs" },
    { label: t("Settings"), href: "/settings", icon: "settings" },
  ];
  const accountsLine =
    instagramAccountCount === 0
      ? null
      : instagramAccountCount === 1 && instagramUsername
        ? `@${instagramUsername}`
        : t("{count} accounts connected", { count: instagramAccountCount });

  return (
    <AppShell
      items={items}
      homeHref="/dashboard"
      identity={{
        name: workspaceName,
        detail: accountsLine ? (
          <p className="truncate text-xs text-faint">{accountsLine}</p>
        ) : (
          <a href="/accounts/connect" className="text-xs font-medium text-accent-fg hover:text-accent-fg-hover">
            {t("Connect Instagram")}
          </a>
        ),
      }}
    >
      {children}
    </AppShell>
  );
}
