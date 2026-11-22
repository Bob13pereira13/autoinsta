import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, EMAIL_PROVIDER_ID, PASSWORD_PROVIDER_ID, signIn } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import BrandMark from "@/components/brand-mark";
import { brand } from "@/config/brand";
import { isSignupAvailable } from "@/lib/security/turnstile";

export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("Login - {brand}"),
    description: t("Sign in to manage Instagram comment-to-DM campaigns."),
  };
}

/** Only same-site relative paths: never redirect to another origin. */
function safeCallbackUrl(value: string | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

type LoginSearchParams = {
  callbackUrl?: string;
  error?: string;
  code?: string;
  reset?: string;
  passwordChanged?: string;
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const { t } = await getI18n();
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);

  // Validated session (not just a cookie): see proxy.ts.
  if ((await auth())?.user?.id) {
    redirect(callbackUrl);
  }

  async function loginWithPassword(formData: FormData) {
    "use server";
    try {
      await signIn(PASSWORD_PROVIDER_ID, {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: callbackUrl,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        const code = "code" in error && typeof error.code === "string" ? error.code : "credentials";
        redirect(
          `/login?error=${encodeURIComponent(error.type)}&code=${encodeURIComponent(code)}&callbackUrl=${encodeURIComponent(callbackUrl)}`
        );
      }
      throw error;
    }
  }

  async function sendMagicLink(formData: FormData) {
    "use server";
    await signIn(EMAIL_PROVIDER_ID, {
      email: String(formData.get("email") ?? ""),
      redirectTo: callbackUrl,
    });
  }

  let errorMessage: string | null = null;
  // The password was right, the e-mail was never confirmed: offer a new link.
  const unconfirmed = params.code === "email_not_verified";
  if (unconfirmed) {
    errorMessage = t("Confirm your e-mail before signing in: open the link we sent when you signed up.");
  } else if (params.code === "account_disabled") {
    errorMessage = t("Account disabled, contact support: {email}", { email: brand.support.email });
  } else if (params.code === "rate_limited") {
    errorMessage = t("Too many attempts. Wait 15 minutes or reset your password.");
  } else if (params.error === "CredentialsSignin") {
    errorMessage = t("Incorrect e-mail or password.");
  } else if (params.error === "Verification") {
    errorMessage = t("This sign-in link has expired or was already used. Request a new one.");
  } else if (params.error) {
    errorMessage = t("Could not sign in. Please try again.");
  }

  let successMessage: string | null = null;
  if (params.reset === "1") {
    successMessage = t("Password saved. Sign in with your e-mail and new password.");
  } else if (params.passwordChanged === "1") {
    successMessage = t("Password changed. Sign in again with the new password.");
  }

  const inputClass = "field";

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pb-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1>
            <BrandMark size="lg" />
          </h1>
          <p className="text-muted text-sm leading-relaxed mt-3">
            {t("Sign in to manage your Instagram automations.")}
          </p>
        </div>

        <div className="card p-8 space-y-6">
          {errorMessage && (
            <div role="alert" className="rounded-control border border-error-border bg-error-soft px-4 py-3 text-sm text-error">
              <p>{errorMessage}</p>
              {unconfirmed && (
                <Link href="/confirmar-email" className="mt-2 inline-block font-semibold underline underline-offset-2">
                  {t("Resend the confirmation link")}
                </Link>
              )}
            </div>
          )}
          {successMessage && (
            <p role="status" className="rounded-control border border-success-border bg-success-soft px-4 py-3 text-sm text-success">
              {successMessage}
            </p>
          )}

          <form action={loginWithPassword} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="label">
                {t("E-mail")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="voce@empresa.com.br"
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="label">
                  {t("Password")}
                </label>
                <Link href="/esqueci-senha" className="text-[13px] text-accent-fg hover:text-accent-fg-hover hover:underline">
                  {t("Forgot your password?")}
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary w-full"
            >
              {t("Sign in")}
            </button>
          </form>

          <details className="border-t border-border-subtle pt-5 text-sm">
            <summary className="cursor-pointer text-muted hover:text-foreground">
              {t("Prefer a sign-in link by e-mail?")}
            </summary>
            <form action={sendMagicLink} className="mt-4 space-y-3">
              <label htmlFor="magic-email" className="sr-only">
                {t("E-mail")}
              </label>
              <input
                id="magic-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="voce@empresa.com.br"
                className={inputClass}
              />
              <button
                type="submit"
                className="btn btn-secondary w-full"
              >
                {t("Email me a magic link")}
              </button>
            </form>
          </details>
        </div>

        {isSignupAvailable() && (
          <p className="mt-6 text-center text-sm text-muted">
            {t("New here?")}{" "}
            <Link href="/cadastro" className="font-semibold text-accent-fg hover:text-accent-fg-hover hover:underline">
              {t("Create account")}
            </Link>
          </p>
        )}

        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/privacidade" className="hover:text-foreground">
            {t("Privacy Policy")}
          </Link>{" "}
          ·{" "}
          <Link href="/termos" className="hover:text-foreground">
            {t("Terms of Use")}
          </Link>
        </p>
      </div>
    </div>
  );
}
