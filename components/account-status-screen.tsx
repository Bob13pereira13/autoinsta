import BrandMark from "@/components/brand-mark";
import LanguageSwitcher from "@/components/language-switcher";
import { brand } from "@/config/brand";
import { signOut } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { REJECTED_RETENTION_DAYS } from "@/lib/workspace-status";

/**
 * What a client that is not ACTIVE sees after signing in, instead of the
 * dashboard: access under review, sign-up not approved (with the reason, read
 * from the database — never from the URL, so nobody can forge it), or account
 * turned off. The APIs refuse these clients too (lib/workspace-access.ts).
 */
export default async function AccountStatusScreen({
  status,
  rejectionReason,
  rejectedAt,
}: {
  status: "PENDING_APPROVAL" | "REJECTED" | "DISABLED";
  rejectionReason?: string | null;
  rejectedAt?: Date | null;
}) {
  const { t, locale } = await getI18n();
  // Typed as string: config/brand.ts may leave it empty.
  const whatsapp: string = brand.support.whatsapp;

  async function leave() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const deletesOn = rejectedAt
    ? new Date(rejectedAt.getTime() + REJECTED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toLocaleDateString(locale)
    : null;
  const title =
    status === "PENDING_APPROVAL"
      ? t("Your access is under review")
      : status === "REJECTED"
        ? t("Your sign-up was not approved")
        : t("Account disabled, contact support");
  const body =
    status === "PENDING_APPROVAL"
      ? t("Thanks for signing up! Our team is reviewing your account and you will get an e-mail as soon as it is approved. Until then the dashboard stays locked.")
      : status === "REJECTED"
        ? t("We reviewed your sign-up and could not approve it.")
        : t("This account was turned off. Your automations are paused and nothing was deleted. Talk to support to turn it back on.");

  return (
    <div className="min-h-screen bg-background">
      <div className="flex justify-end px-5 pt-4">
        <LanguageSwitcher />
      </div>
      <main className="mx-auto flex max-w-md flex-col items-center px-6 pb-12 pt-10 text-center">
        <BrandMark size="lg" />
        <div className="panel mt-8 w-full rounded p-8 text-left">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="mt-3 text-sm text-muted">{body}</p>
          {status === "REJECTED" && rejectionReason && (
            <p className="mt-4 rounded border border-border bg-surface p-3 text-sm text-foreground">
              <span className="font-semibold">{t("Reason:")}</span> {rejectionReason}
            </p>
          )}
          {status === "REJECTED" && deletesOn && (
            <p className="mt-3 text-xs text-muted">
              {t("Your sign-up data will be deleted on {date}. After that you can sign up again.", { date: deletesOn })}
            </p>
          )}
          <div className="mt-6 space-y-1 border-t border-border pt-4 text-sm">
            <p className="font-medium text-foreground">{t("Support")}</p>
            <a href={`mailto:${brand.support.email}`} className="block text-accent hover:underline">
              {brand.support.email}
            </a>
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} className="block text-accent hover:underline">
                {t("WhatsApp {number}", { number: whatsapp })}
              </a>
            )}
          </div>
          <form action={leave} className="mt-6">
            <button type="submit" className="w-full rounded border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-hover">
              {t("Sign out")}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
