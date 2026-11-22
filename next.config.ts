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
    ];
  },
};

export default nextConfig;
