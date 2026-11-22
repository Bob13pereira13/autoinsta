import Link from "next/link";
import { redirect } from "next/navigation";
import BrandMark from "@/components/brand-mark";
import LanguageSwitcher from "@/components/language-switcher";
import { getAdminEmail } from "@/lib/admin/auth";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/auth-actions";
import { I18nProvider } from "@/lib/i18n/provider";
import AdminNav from "@/components/admin/admin-nav";
import ThemeToggle from "@/components/ui/theme-toggle";
import { Icon } from "@/components/ui/icons";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("Admin - {brand}"), robots: { index: false } };
}

/**
 * Admin area, for the operator e-mails in ADMIN_EMAILS. proxy.ts answers 403
 * first; this server check is the backstop (every API checks again too).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getI18n();
  const adminEmail = await getAdminEmail();
  if (!adminEmail) {
    if (!(await auth())?.user?.id) redirect("/login?callbackUrl=/admin");
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="title-page">403</h1>
        <p className="mt-2 text-sm text-muted">{t("This area is restricted to the platform operators.")}</p>
      </main>
    );
  }
  const nav = [
    { href: "/admin", label: t("Overview") },
    { href: "/admin/clients", label: t("Clients") },
    { href: "/admin/clients/new", label: t("New client") },
    { href: "/admin/diagnostics", label: t("Diagnostics") },
    { href: "/admin/settings", label: t("Settings") },
  ];
  return (
    <I18nProvider locale={locale}>
      <div className="min-h-screen">
        <header
          className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar backdrop-blur-xl"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
            <Link href="/admin" className="flex items-center gap-2.5 rounded-item">
              <BrandMark href={null} size="sm" />
              <span className="rounded-full border border-accent-soft-border bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-soft-fg">
                {t("Admin area")}
              </span>
            </Link>
            <div className="order-last w-full sm:order-none sm:w-auto">
              <AdminNav items={nav} label={t("Admin area")} />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1 text-sm">
              <span className="hidden px-2 text-xs text-faint xl:inline">{adminEmail}</span>
              <Link href="/dashboard" className="flex min-h-10 items-center rounded-item px-3 text-muted transition-colors hover:bg-nav-hover hover:text-heading">
                {t("Back to the dashboard")}
              </Link>
              <ThemeToggle className="min-h-10" />
              <form action={signOutAction}>
                <button type="submit" className="flex min-h-10 items-center gap-2 rounded-item px-3 text-muted transition-colors hover:bg-nav-hover hover:text-heading">
                  <Icon name="logout" size={18} />
                  {t("Sign out")}
                </button>
              </form>
              <div className="px-2">
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-12 pt-7 sm:px-6">{children}</main>
      </div>
    </I18nProvider>
  );
}
