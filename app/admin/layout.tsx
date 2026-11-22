import Link from "next/link";
import { redirect } from "next/navigation";
import BrandMark from "@/components/brand-mark";
import LanguageSwitcher from "@/components/language-switcher";
import { getAdminEmail } from "@/lib/admin/auth";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/auth-actions";
import { I18nProvider } from "@/lib/i18n/provider";
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
        <h1 className="text-lg font-semibold">403</h1>
        <p className="mt-2 text-sm text-muted">{t("This area is restricted to the platform operators.")}</p>
      </main>
    );
  }
  const nav = [
    { href: "/admin", label: t("Overview") },
    { href: "/admin/clients", label: t("Clients") },
    { href: "/admin/clients/new", label: t("New client") },
    { href: "/admin/settings", label: t("Settings") },
  ];
  return (
    <I18nProvider locale={locale}>
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
            <Link href="/admin" className="flex items-center gap-2">
              <BrandMark href={null} />
              <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{t("Admin area")}</span>
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm" aria-label={t("Admin area")}>
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="text-muted hover:text-foreground">
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-xs text-muted">
              <span className="hidden sm:inline">{adminEmail}</span>
              <Link href="/dashboard" className="hover:text-foreground">{t("Back to the dashboard")}</Link>
              <LanguageSwitcher />
              <form action={signOutAction}>
                <button type="submit" className="hover:text-foreground">{t("Sign out")}</button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </I18nProvider>
  );
}
