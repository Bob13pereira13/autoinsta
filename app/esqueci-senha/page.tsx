import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import BrandMark from "@/components/brand-mark";
import { getI18n } from "@/lib/i18n/server";
import { requestPasswordReset } from "@/lib/account/tokens";
import { getClientIp, isLoginBlocked, recordLoginFailure } from "@/lib/account/login-rate-limit";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("Reset password - {brand}"), robots: { index: false } };
}

export default async function EsqueciSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string }>;
}) {
  const { t } = await getI18n();
  const sent = (await searchParams).enviado === "1";

  async function submit(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    // Shares the login throttle so the form cannot be used to flood inboxes.
    const ip = getClientIp(await headers());
    const throttleKey = `reset:${email}`;
    if (email && !(await isLoginBlocked(throttleKey, ip))) {
      await recordLoginFailure(throttleKey, ip);
      await requestPasswordReset(email);
    }
    redirect("/esqueci-senha?enviado=1");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pb-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1>
            <BrandMark size="lg" />
          </h1>
        </div>
        <div className="card p-8">
          <h2 className="title-section">{t("Reset password")}</h2>
          {sent ? (
            <p role="status" className="mt-3 text-sm text-muted">
              {t("If this e-mail has an account, we sent a link to set a new password. It is valid for 1 hour. Check your spam folder too.")}
            </p>
          ) : (
            <form action={submit} className="mt-4 space-y-4">
              <p className="text-sm text-muted">
                {t("Enter the e-mail you use to sign in and we will send you a link to choose a new password.")}
              </p>
              <label htmlFor="email" className="sr-only">
                {t("E-mail")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="voce@empresa.com.br"
                className="field"
              />
              <button
                type="submit"
                className="btn btn-primary w-full"
              >
                {t("Send link")}
              </button>
            </form>
          )}
          <p className="mt-6 text-sm">
            <Link href="/login" className="link">
              {t("Back to sign in")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
