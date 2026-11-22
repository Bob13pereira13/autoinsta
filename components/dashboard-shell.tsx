"use client";

import { useCallback, useRef, useState } from "react";
import Sidebar from "@/components/sidebar";
import TopBar from "@/components/top-bar";

interface DashboardShellProps {
  children: React.ReactNode;
  workspaceName: string;
  instagramUsername: string | null;
  instagramAccountCount: number;
}

export default function DashboardShell({ children, workspaceName, instagramUsername, instagramAccountCount }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    // Back to where the person was (the menu button lives in the header).
    document.querySelector<HTMLElement>("header button[aria-expanded]")?.focus();
  }, []);

  return (
    // h-dvh, not h-screen: on mobile browsers the URL bar eats into 100vh, which
    // would push the composer and pagination controls below the fold.
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        workspaceName={workspaceName}
        instagramUsername={instagramUsername}
        instagramAccountCount={instagramAccountCount}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(true)} menuOpen={sidebarOpen} />

        {/* overflow-x-hidden: enabling vertical scrolling makes the browser
            allow horizontal scrolling too, which lets a wide child drag the
            whole page sideways on a phone. */}
        <main ref={main} className="flex-1 overflow-y-auto overflow-x-hidden" inert={sidebarOpen ? true : undefined}>
          <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6 lg:px-11 lg:pt-9">{children}</div>
        </main>
      </div>
    </div>
  );
}
