import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { FacebookLoginButton } from "@/components/facebook-login-button";
import { isUnifiedLogin } from "@/lib/env";
import { getI18n } from "@/lib/i18n/server";
import { PERMISSION_PURPOSE, requestedPermissions } from "@/lib/meta/permissions";

/**
 * Before Meta's login: what is needed, what Meta will ask and what each
 * permission is for, then the official "Continue with Facebook" button. Every
 * "Connect Instagram" in the app leads here first.
 */
export default async function ConnectInstagramPage() {
  const { t } = await getI18n();
  const facebook = isUnifiedLogin();
  const permissions = requestedPermissions();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={t("Connect your Instagram account")}
        description={
          facebook
            ? t("You will sign in with Facebook. Meta shows what this app can do and asks for your approval; we never see your Facebook or Instagram password.")
            : t("You will sign in with Instagram. Meta shows what this app can do and asks for your approval; we never see your Instagram password.")
        }
      />

      <section className="card space-y-3 p-5 sm:p-6">
        <h2 className="title-section">{t("Before you start")}</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          <li>{t("An Instagram professional account (Business or Creator).")}</li>
          {facebook && <li>{t("The Instagram account linked to a Facebook Page, and that Page in a business portfolio you manage.")}</li>}
          <li>{t("In the Instagram app, Settings → Messages and story replies → Message controls → Connected tools: “Allow access to messages” on, so automatic DMs can be sent.")}</li>
          {facebook && <li>{t("On Meta's screen, select the Instagram account you want to use and keep every permission selected.")}</li>}
        </ul>
      </section>

      <section className="card space-y-3 p-5 sm:p-6" aria-labelledby="permissions-title">
        <h2 id="permissions-title" className="title-section">
          {t("What Meta will ask, and why")}
        </h2>
        <ul className="space-y-3" data-permissions>
          {permissions.map((permission) => (
            <li key={permission} className="text-sm leading-relaxed">
              <p className="font-mono text-xs font-semibold text-heading">{permission}</p>
              <p className="mt-0.5 text-muted">{t(PERMISSION_PURPOSE[permission])}</p>
            </li>
          ))}
          {facebook && (
            <li className="text-sm leading-relaxed">
              <p className="font-mono text-xs font-semibold text-heading">public_profile</p>
              <p className="mt-0.5 text-muted">{t("Part of every Facebook login. This app does not read your Facebook profile.")}</p>
            </li>
          )}
        </ul>
        <p className="text-xs leading-relaxed text-faint">
          {t("You can remove the app's access at any time: disconnect the account in Accounts, or remove the app in your Facebook or Instagram settings. Both delete the account's data, as the Privacy Policy explains.")}
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <FacebookLoginButton href="/api/instagram/connect" facebook={facebook} />
        <Link href="/accounts" className="btn btn-secondary">
          {t("Cancel")}
        </Link>
      </div>
    </div>
  );
}
