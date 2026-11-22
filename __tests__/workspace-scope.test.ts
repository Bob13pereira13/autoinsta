/**
 * The client's workspace has only what belongs to the Instagram automations:
 * no API v1, MCP or service keys, Diagnostics only in the admin area, a menu
 * with Dashboard, Automations, Accounts, DM Logs and Settings, and Settings
 * without the Instagram accounts block or the "self-hosted" line.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { config as proxyConfig } from "../proxy";

const root = path.join(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "generated" ? [] : routeFiles(full);
    return /^(page|route)\.(t|j)sx?$/.test(name) ? [path.relative(root, full).split(path.sep).join("/")] : [];
  });
}
const files = routeFiles(path.join(root, "app"));

describe("API v1, MCP and service keys are gone", () => {
  it("no page or route serves them", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.filter((f) => /^app\/api\/(v1|mcp|integrations)\//.test(f))).toEqual([]);
    expect(files.filter((f) => /integrations/.test(f))).toEqual([]);
    // No catch-all API route that could answer them instead.
    expect(files.filter((f) => /^app\/api\/\[/.test(f))).toEqual([]);
  });

  it("their code, docs and the ServiceKey model are gone", () => {
    expect(existsSync(path.join(root, "lib/integrations"))).toBe(false);
    expect(existsSync(path.join(root, "docs/integrations.md"))).toBe(false);
    expect(read("prisma/schema.prisma")).not.toMatch(/ServiceKey|serviceKeys/);
    expect(read("lib/i18n/pt-BR.json")).not.toMatch(/"API & MCP"|service key/i);
  });
});

describe("Diagnostics belongs to the admin area", () => {
  it("is an admin page; the client's page is gone", () => {
    expect(files).toContain("app/admin/diagnostics/page.tsx");
    expect(files).toContain("app/api/admin/diagnostics/route.ts");
    expect(files.filter((f) => /^app\/\(dashboard\)\/diagnostics/.test(f))).toEqual([]);
    expect(read("app/admin/layout.tsx")).toContain('"/admin/diagnostics"');
  });

  it("the route only runs for ADMIN_EMAILS (withAdmin)", () => {
    expect(read("app/api/admin/diagnostics/route.ts")).toMatch(/withAdmin\(/);
  });
});

describe("old links and the client's menu", () => {
  it("redirects /integrations and /diagnostics (and anything under them) to /dashboard, temporarily", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: "/integrations", destination: "/dashboard", permanent: false },
        { source: "/integrations/:path*", destination: "/dashboard", permanent: false },
        { source: "/diagnostics", destination: "/dashboard", permanent: false },
        { source: "/diagnostics/:path*", destination: "/dashboard", permanent: false },
      ])
    );
    expect(proxyConfig.matcher.some((m: string) => /^\/(integrations|diagnostics)/.test(m))).toBe(false);
  });

  it("the menu has Dashboard, Automations, Accounts, DM Logs and Settings, then Theme and Sign out", () => {
    const sidebar = read("components/sidebar.tsx");
    const hrefs = [...sidebar.matchAll(/\{ label: "[^"]+", href: "([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/dashboard", "/automations", "/accounts", "/logs", "/settings"]);
    expect(sidebar).toContain("<ThemeToggle />");
    expect(sidebar).toContain("signOutAction");
  });
});

describe("Settings", () => {
  const settings = read("app/(dashboard)/settings/page.tsx");

  it("keeps Team, Language, the password and DMs sent this month", () => {
    for (const key of ['t("Team")', 't("Interface language")', "<ChangePasswordCard />", 't("DMs sent this month")']) {
      expect(settings).toContain(key);
    }
  });

  it("no longer has the Instagram accounts block or the self-hosted line", () => {
    expect(settings).not.toContain('t("Instagram accounts")');
    expect(settings).not.toContain("Open Accounts");
    expect(settings).not.toMatch(/Self-hosted/);
  });
});
