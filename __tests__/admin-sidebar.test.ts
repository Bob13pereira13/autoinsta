/**
 * The admin area uses the client dashboard's side menu (components/sidebar.tsx
 * through components/app-shell.tsx), not a menu of its own: Overview, Clients,
 * Diagnostics, Settings with icons, the "Admin area" badge by the logo, and at
 * the bottom the admin's e-mail, back to the dashboard, language, theme and
 * sign out. The current section stays marked on its subpages.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isItemActive, type SidebarItem } from "@/components/sidebar-items";

const root = path.join(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const adminItems: SidebarItem[] = [
  { label: "Overview", href: "/admin", icon: "dashboard", exact: true },
  { label: "Clients", href: "/admin/clients", icon: "users" },
  { label: "Diagnostics", href: "/admin/diagnostics", icon: "diagnostics" },
  { label: "Settings", href: "/admin/settings", icon: "settings" },
];
const activeOn = (items: SidebarItem[], pathname: string) => items.filter((i) => isItemActive(i, pathname)).map((i) => i.href);

describe("admin area side menu", () => {
  const shell = read("components/admin/admin-shell.tsx");
  const layout = read("app/admin/layout.tsx");

  it("Overview, Clients, Diagnostics, Settings, in this order, each with an icon; no “New client”", () => {
    const items = [...shell.matchAll(/\{ label: t\("([^"]+)"\), href: "([^"]+)", icon: "([^"]+)"/g)].map((m) => [m[1], m[2], m[3]]);
    expect(items).toEqual([
      ["Overview", "/admin", "dashboard"],
      ["Clients", "/admin/clients", "users"],
      ["Diagnostics", "/admin/diagnostics", "diagnostics"],
      ["Settings", "/admin/settings", "settings"],
    ]);
    expect(shell).not.toContain('"/admin/clients/new"');
  });

  it("the Clients page keeps “New client” at its top", () => {
    const clients = read("app/admin/clients/page.tsx");
    const button = clients.indexOf('href="/admin/clients/new"');
    expect(button).toBeGreaterThan(-1);
    // Right next to the page title, before the search and the list.
    expect(button).toBeLessThan(clients.indexOf('role="search"'));
    expect(button - clients.indexOf('className="title-page"')).toBeLessThan(200);
  });

  it("the same shell and menu as the client's dashboard; the old top menu is gone", () => {
    expect(layout).toContain("<AdminShell adminEmail={adminEmail}>");
    expect(shell).toContain('import AppShell from "@/components/app-shell"');
    expect(read("components/dashboard-shell.tsx")).toContain('import AppShell from "@/components/app-shell"');
    expect(read("components/app-shell.tsx")).toContain("<Sidebar ");
    expect(existsSync(path.join(root, "components/admin/admin-nav.tsx"))).toBe(false);
    expect(layout).not.toMatch(/<header|<nav/);
  });

  it("the badge by the logo, and at the bottom the e-mail, back to the dashboard, language, theme and sign out", () => {
    expect(shell).toContain('badge={t("Admin area")}');
    expect(shell).toContain("name: adminEmail");
    expect(shell).toContain('href="/dashboard"');
    expect(shell).toContain('t("Back to the dashboard")');
    const sidebar = read("components/sidebar.tsx");
    const order = ["data-sidebar-identity", "<LanguageSwitcher />", "<ThemeToggle />", "signOutAction}"].map((s) => sidebar.indexOf(s));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The phone's top bar shows the badge too.
    expect(read("components/top-bar.tsx")).toContain("{badge && <AreaBadge>{badge}</AreaBadge>}");
  });

  it.each([
    ["/admin", ["/admin"]],
    ["/admin/clients", ["/admin/clients"]],
    ["/admin/clients/cmws8tnby0002", ["/admin/clients"]],
    ["/admin/clients/new", ["/admin/clients"]],
    ["/admin/diagnostics", ["/admin/diagnostics"]],
    ["/admin/settings", ["/admin/settings"]],
  ])("%s marks %j, and only it", (pathname, expected) => {
    expect(activeOn(adminItems, pathname)).toEqual(expected);
  });

  it("the client's menu keeps its rules (an automation's editor marks Automations)", () => {
    const items: SidebarItem[] = [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
      { label: "Automations", href: "/automations", icon: "automations", also: ["/campaigns"] },
    ];
    expect(activeOn(items, "/campaigns/abc/edit")).toEqual(["/automations"]);
    expect(activeOn(items, "/dashboard")).toEqual(["/dashboard"]);
    expect(activeOn(items, "/automationsx")).toEqual([]);
  });
});
