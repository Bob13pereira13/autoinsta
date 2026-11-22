import Link from "next/link";
import { redirect } from "next/navigation";
import BrandMark from "@/components/brand-mark";
import ResendConfirmationForm from "@/components/resend-confirmation-form";
import { confirmSignupEmail } from "@/lib/account/signup";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("Confirm e-mail - {brand}"), robots: { index: false } };
}

/**
 * The confirmation link opens this page; the address is only confirmed when
 * the person presses the button (a POST), so link scanners in mail clients do
 * not use up the link. Without a token, it offers to resend the link.
 */
export default async function ConfirmarEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string; email?: string }>;
}) {
  const { t } = await getI18n();
  const params = await searchParams;
  const token = params.token ?? "";

  async function confirm(formData: FormData) {
    "use server";
    const result = await confirmSignupEmail(String(formData.get("token") ?? ""));
    redirect(!result.ok ? "/confirmar-email?status=invalid" : result.active ? "/confirmar-email?status=active" : "/confirmar-email?status=ok");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 pb-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1>
            <BrandMark size="lg" />
          </h1>
        </div>
        <div className="panel space-y-4 rounded p-8">
          {params.status === "active" ? (
            <>
              <h2 className="text-lg font-semibold">{t("E-mail confirmed")}</h2>
              <p className="text-sm text-muted">
                {t("Your account is active. Sign in to connect your Instagram account and create your first automation.")}
              </p>
              <Link href="/login?callbackUrl=%2Fdashboard" className="inline-flex w-full justify-center rounded bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover">
                {t("Sign in to the dashboard")}
              </Link>
            </>
          ) : params.status === "ok" ? (
            <>
              <h2 className="text-lg font-semibold">{t("E-mail confirmed")}</h2>
              <p className="text-sm text-muted">
                {t("Your account is now under review. You will get an e-mail as soon as it is approved, and you can already sign in to follow it.")}
              </p>
              <Link href="/login" className="inline-flex w-full justify-center rounded bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover">
                {t("Sign in")}
              </Link>
            </>
          ) : token ? (
            <form action={confirm} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <h2 className="text-lg font-semibold">{t("Confirm your e-mail")}</h2>
              <p className="text-sm text-muted">{t("Press the button to confirm this address and finish signing up.")}</p>
              <button type="submit" className="w-full rounded bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover">
                {t("Confirm my e-mail")}
              </button>
            </form>
          ) : (
            <>
              <h2 className="text-lg font-semibold">
                {params.status === "invalid" ? t("This link is invalid, expired or was already used.") : t("Resend the confirmation link")}
              </h2>
              <p className="text-sm text-muted">{t("Enter the e-mail you signed up with and we will send a new link.")}</p>
              <ResendConfirmationForm defaultEmail={params.email ?? ""} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
