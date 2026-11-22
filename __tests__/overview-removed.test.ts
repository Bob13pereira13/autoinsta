/**
 * The Overview tab was removed, together with the daily follower snapshot and
 * the insights readers only it used. Old links land on the Dashboard; the DM
 * personalization (getRecipientUsername) and the sending functions stay.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import manifest from "../app/manifest";
import { config as proxyConfig } from "../proxy";
import * as provider from "../lib/instagram/provider";
import * as metaClient from "../lib/meta/client";
import { getInstagramScopes } from "../lib/meta/scopes";
import type { InstagramContext } from "../lib/instagram/provider";

const root = path.join(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return /^(page|route)\.(t|j)sx?$/.test(name) ? [path.relative(root, full)] : [];
  });
}

const META: InstagramContext = { provider: "META", accessToken: "token", instagramId: "ig_business", unifiedLogin: false };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Overview removed", () => {
  it("redirects /overview and anything under it to /dashboard (temporary, not cached for good)", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: "/overview", destination: "/dashboard", permanent: false },
        { source: "/overview/:path*", destination: "/dashboard", permanent: false },
      ])
    );
  });

  it("no page or route serves the Overview, its API or the follower snapshot job", () => {
    const files = routeFiles(path.join(root, "app"));
    expect(files.length).toBeGreaterThan(20);
    // The operators' summary under /admin is a different page and stays.
    const customerFacing = files.filter((f) => !f.startsWith(path.join("app", "admin")) && !f.startsWith(path.join("app", "api", "admin")));
    expect(customerFacing.filter((f) => /overview|follower|snapshot/i.test(f))).toEqual([]);
    expect(files).toContain(path.join("app", "(dashboard)", "dashboard", "page.tsx"));
    expect(files).toContain(path.join("app", "api", "dashboard", "stats", "route.ts"));
    expect(existsSync(path.join(root, "lib", "reports", "follower-history.ts"))).toBe(false);
    expect(existsSync(path.join(root, "components", "follower-chart.tsx"))).toBe(false);
  });

  it("the menu, the top bar and the proxy lists no longer mention it", () => {
    for (const file of ["components/sidebar.tsx", "components/top-bar.tsx", "proxy.ts"]) {
      expect(read(file), file).not.toMatch(/["']\/overview/);
    }
    expect(proxyConfig.matcher).toEqual(expect.arrayContaining(["/dashboard", "/dashboard/:path*"]));
    expect(proxyConfig.matcher.some((m: string) => m.startsWith("/overview"))).toBe(false);
  });

  it("the installed app opens on the Dashboard", () => {
    expect(manifest().start_url).toBe("/dashboard");
  });

  it("the schedulers no longer call snapshot-followers, and every scheduled route exists", () => {
    const cron = read("scripts/cron.sh");
    expect(cron).not.toContain("snapshot-followers");
    for (const job of ["refresh-tokens", "purge-data", "attach-next-reel"]) expect(cron).toContain(`call ${job}`);

    const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string }[] };
    expect(vercel.crons.map((c) => c.path)).not.toContain("/api/cron/snapshot-followers");
    for (const { path: route } of vercel.crons) {
      expect(existsSync(path.join(root, "app", route, "route.ts")), route).toBe(true);
    }
  });

  it("the insights readers are gone; the DM sending and the username lookup stay", () => {
    for (const mod of [provider, metaClient] as Record<string, unknown>[]) {
      expect(mod).not.toHaveProperty("getMediaInsights");
      expect(mod).not.toHaveProperty("getFollowerCountSeries");
      expect(mod).not.toHaveProperty("getZernioFollowerSnapshots");
    }
    expect(typeof provider.getRecipientUsername).toBe("function");
    expect(typeof provider.resolveRecipientName).toBe("function");
    expect(typeof provider.sendDirectMessage).toBe("function");
    expect(typeof provider.sendPrivateReply).toBe("function");
  });

  it("never asks Meta for the insights permission, even with the old variable still set", () => {
    vi.stubEnv("INSTAGRAM_INSIGHTS_ENABLED", "true");
    expect(getInstagramScopes()).toEqual([
      "instagram_business_basic",
      "instagram_business_manage_comments",
      "instagram_business_manage_messages",
    ]);
    expect(read(".env.example")).not.toContain("INSTAGRAM_INSIGHTS_ENABLED");
  });
});

describe("what the DMs still use", () => {
  it("getRecipientUsername still reads the sender's handle for {username}", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ username: "fan.da.loja" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await provider.getRecipientUsername({ context: META, recipientId: "igsid_123" })).toBe("fan.da.loja");
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toMatch(/\/igsid_123$/);
    expect(url.searchParams.get("fields")).toBe("username");
  });

  it("the connected account's profile no longer asks for the follower count", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "app_scoped", user_id: "ig_business", username: "loja", name: "Loja" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const info = await provider.getUserInfo({ context: META });
    expect(info.username).toBe("loja");
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get("fields")).toBe("id,user_id,username,name,profile_picture_url");
  });
});
