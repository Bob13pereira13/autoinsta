"use client";

/**
 * The frame of a signed-in area: the side menu (a drawer on phones, opened
 * from the phone's top bar) and the scrolling page. The client's dashboard and
 * the admin area both use it, each with its own menu (SidebarConfig).
 */

import { useCallback, useState } from "react";
import Sidebar, { type SidebarConfig } from "@/components/sidebar";
import TopBar from "@/components/top-bar";

export default function AppShell({ children, ...menu }: SidebarConfig & { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    // Back to where the person was (the menu button lives in the header).
    document.querySelector<HTMLElement>("header button[aria-expanded]")?.focus();
  }, []);

  return (
    // h-dvh, not h-screen: on mobile browsers the URL bar eats into 100vh, which
    // would push the composer and pagination controls below the fold.
    <div className="flex h-dvh overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} {...menu} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} menuOpen={sidebarOpen} homeHref={menu.homeHref} badge={menu.badge} />

        {/* overflow-x-hidden: enabling vertical scrolling makes the browser
            allow horizontal scrolling too, which lets a wide child drag the
            whole page sideways on a phone. */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden" inert={sidebarOpen ? true : undefined}>
          <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6 lg:px-11 lg:pt-9">{children}</div>
        </main>
      </div>
    </div>
  );
}
