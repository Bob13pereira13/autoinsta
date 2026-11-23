import { redirect } from "next/navigation";
import { getAdminEmail } from "@/lib/admin/auth";
import { auth } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n/provider";
import AdminShell from "@/components/admin/admin-shell";
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
  return (
    <I18nProvider locale={locale}>
      <AdminShell adminEmail={adminEmail}>{children}</AdminShell>
    </I18nProvider>
  );
}
