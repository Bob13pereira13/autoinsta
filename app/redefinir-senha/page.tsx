import Link from "next/link";
import { redirect } from "next/navigation";
import BrandMark from "@/components/brand-mark";
import SetPasswordForm, { type SetPasswordState } from "@/components/set-password-form";
import { getI18n } from "@/lib/i18n/server";
import { findValidAuthToken, setPasswordWithToken } from "@/lib/account/tokens";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("Set password - {brand}"), robots: { index: false } };
}

async function savePassword(_state: SetPasswordState, formData: FormData): Promise<SetPasswordState> {
  "use server";
  const password = formData.get("password");
  if (password !== formData.get("confirm")) {
    return { error: "As senhas não coincidem." };
  }
  const result = await setPasswordWithToken(String(formData.get("token") ?? ""), password);
  if (!result.ok) return { error: result.error };
  redirect("/login?reset=1");
}

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; "boas-vindas"?: string }>;
}) {
  const { t } = await getI18n();
  const params = await searchParams;
  const token = params.token ?? "";
  const welcome = params["boas-vindas"] === "1";
  const found = await findValidAuthToken(token);
  // A sign-up confirmation link cannot set a password.
  const record = found && (found.purpose === "WELCOME" || found.purpose === "RESET") ? found : null;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pb-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1>
            <BrandMark size="lg" />
          </h1>
        </div>
        <div className="panel rounded p-8">
          <h2 className="text-lg font-semibold">
            {welcome ? t("Welcome! Choose your password") : t("Choose a new password")}
          </h2>
          {record ? (
            <>
              {record.user.email && (
                <p className="mt-2 text-sm text-muted">
                  {t("Account: {email}", { email: record.user.email })}
                </p>
              )}
              <SetPasswordForm action={savePassword} token={token} submitLabel={t("Save password")} />
            </>
          ) : (
            <div className="mt-3 space-y-4 text-sm">
              <p role="alert" className="text-error">
                {t("This link is invalid, expired or was already used.")}
              </p>
              <Link href="/esqueci-senha" className="text-accent hover:underline">
                {t("Request a new link")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
