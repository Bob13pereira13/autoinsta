import Link from "next/link";
import { redirect } from "next/navigation";
import BrandMark from "@/components/brand-mark";
import SignupForm from "@/components/signup-form";
import { auth } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { isSignupAvailable, turnstileSiteKey } from "@/lib/security/turnstile";
import { getRequireSignupApproval } from "@/lib/signup-approval";

// The sign-up approval setting is read on every request.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("Create account - {brand}") };
}

export default async function CadastroPage() {
  const { t } = await getI18n();
  if ((await auth())?.user?.id) redirect("/dashboard");
  // Read at request time, so the key is a runtime variable (no rebuild).
  const siteKey = turnstileSiteKey();
  const requireApproval = await getRequireSignupApproval();

  return (
    <div className="flex min-h-screen items-start justify-center px-6 pb-12 pt-4 sm:items-center">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1>
            <BrandMark size="lg" />
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {requireApproval
              ? t("Create your account. After you confirm your e-mail, our team reviews and approves your access.")
              : t("Create your account. As soon as you confirm your e-mail, you can use the dashboard.")}
          </p>
        </div>
        <div className="card p-6 sm:p-8">
          {isSignupAvailable() ? (
            <SignupForm siteKey={siteKey} requireApproval={requireApproval} />
          ) : (
            <p role="alert" className="text-sm text-muted">
              {t("Sign-up is not available right now. Contact support to open an account.")}
            </p>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          {t("Already have an account?")}{" "}
          <Link href="/login" className="font-semibold text-accent-fg hover:text-accent-fg-hover hover:underline">
            {t("Sign in")}
          </Link>
        </p>
      </div>
    </div>
  );
}
