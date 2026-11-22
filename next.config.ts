import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: process.cwd(),
  },
  // The legal pages moved to Portuguese routes; keep the old URLs working in
  // case they were already registered in the Meta App Dashboard.
  async redirects() {
    return [
      { source: "/privacy", destination: "/privacidade", permanent: true },
      { source: "/terms", destination: "/termos", permanent: true },
      { source: "/data-deletion", destination: "/exclusao-dados", permanent: true },
      // The Inbox was removed from the dashboard. Temporary (307), so browsers
      // do not cache it for good in case it ever comes back.
      { source: "/inbox", destination: "/automations", permanent: false },
      { source: "/inbox/:path*", destination: "/automations", permanent: false },
      // Same for the Overview tab: its old links (and installed home-screen
      // shortcuts, whose start_url used to be /overview) land on the Dashboard.
      { source: "/overview", destination: "/dashboard", permanent: false },
      { source: "/overview/:path*", destination: "/dashboard", permanent: false },
      // API & MCP was removed, and Diagnostics moved to the admin area
      // (/admin/diagnostics): their old links land on the Dashboard.
      { source: "/integrations", destination: "/dashboard", permanent: false },
      { source: "/integrations/:path*", destination: "/dashboard", permanent: false },
      { source: "/diagnostics", destination: "/dashboard", permanent: false },
      { source: "/diagnostics/:path*", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
