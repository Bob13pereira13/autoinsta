/** The Inbox was removed from the dashboard: old links redirect, no conversation route remains. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import * as provider from "../lib/instagram/provider";
import * as metaClient from "../lib/meta/client";

const root = path.join(__dirname, "..");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return /^(page|route)\.(t|j)sx?$/.test(name) ? [path.relative(root, full)] : [];
  });
}

describe("Inbox removed", () => {
  it("redirects /inbox and anything under it to /automations (temporary, not cached for good)", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: "/inbox", destination: "/automations", permanent: false },
        { source: "/inbox/:path*", destination: "/automations", permanent: false },
      ])
    );
  });

  it("no page or API route serves the Inbox or Instagram conversations", () => {
    const files = routeFiles(path.join(root, "app"));
    expect(files.length).toBeGreaterThan(20);
    expect(files.filter((f) => /inbox|conversation/i.test(f))).toEqual([]);
    // No catch-all route that could answer /api/instagram/conversations.
    expect(files.filter((f) => f.startsWith(path.join("app", "api", "instagram")) && /\[\.\.\./.test(f))).toEqual([]);
  });

  it("the menu and the top bar no longer link to it", () => {
    for (const file of ["components/sidebar.tsx", "components/dashboard-shell.tsx", "components/top-bar.tsx"]) {
      expect(readFileSync(path.join(root, file), "utf8")).not.toMatch(/["']\/inbox["']/);
    }
  });

  it("the conversation readers are gone; sending is untouched", () => {
    for (const mod of [provider, metaClient] as Record<string, unknown>[]) {
      expect(mod).not.toHaveProperty("getConversations");
      expect(mod).not.toHaveProperty("getConversationMessages");
    }
    expect(typeof provider.sendDirectMessage).toBe("function");
    expect(typeof provider.sendPrivateReply).toBe("function");
  });
});
