import Link from "next/link";
import { redirect } from "next/navigation";
import BrandMark from "@/components/brand-mark";
import SignupForm from "@/components/signup-form";
import { auth } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { isSignupAvailable, turnstileSiteKey } from "@/lib/security/turnstile";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("Create account - {brand}") };
}

export default async function CadastroPage() {
  const { t } = await getI18n();
  if ((await auth())?.user?.id) redirect("/dashboard");
  // Read at request time, so the key is a runtime variable (no rebuild).
  const siteKey = turnstileSiteKey();

  return (
    <div className="flex min-h-screen items-start justify-center px-6 pb-12 pt-4 sm:items-center">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1>
            <BrandMark size="lg" />
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {t("Create your account. After you confirm your e-mail, our team reviews and approves your access.")}
          </p>
        </div>
        <div className="panel rounded p-6 sm:p-8">
          {isSignupAvailable() ? (
            <SignupForm siteKey={siteKey} />
          ) : (
            <p role="alert" className="text-sm text-muted">
              {t("Sign-up is not available right now. Contact support to open an account.")}
            </p>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          {t("Already have an account?")}{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            {t("Sign in")}
          </Link>
        </p>
      </div>
    </div>
  );
}
