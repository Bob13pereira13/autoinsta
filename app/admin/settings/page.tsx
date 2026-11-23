import DefaultLimitForm from "@/components/admin/default-limit-form";
import { formatDate, formatMoney } from "@/components/admin/format";
import PriceForm from "@/components/admin/price-form";
import SignupApprovalForm from "@/components/admin/signup-approval-form";
import TestEmailForm from "@/components/admin/test-email-form";
import { getAdminEmail } from "@/lib/admin/auth";
import { getDefaultAccountLimit } from "@/lib/account-limit";
import { getPlatformPriceCents, listSettingsAudit } from "@/lib/admin/clients";
import { getI18n } from "@/lib/i18n/server";
import { getRequireSignupApproval } from "@/lib/signup-approval";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const { t, locale } = await getI18n();
  const [cents, limit, requireApproval, history, adminEmail] = await Promise.all([
    getPlatformPriceCents(),
    getDefaultAccountLimit(),
    getRequireSignupApproval(),
    listSettingsAudit(),
    getAdminEmail(),
  ]);

  const actionLabel: Record<string, string> = {
    "settings.signupApproval": t("Require approval of new sign-ups"),
    "settings.price": t("Price per Instagram account (R$ per month)"),
    "settings.defaultLimit": t("Default account limit per client"),
  };
  // One readable value per setting, for the "before → after" column.
  const valueOf = (value: unknown): string => {
    const [key, v] = Object.entries((value ?? {}) as Record<string, unknown>)[0] ?? [];
    if (key === "requireSignupApproval") return v ? t("On") : t("Off");
    if (key === "pricePerAccountCents") return typeof v === "number" ? formatMoney(v, locale) : "—";
    if (key === "defaultInstagramAccountLimit") return v === null ? t("No limit") : String(v);
    return "—";
  };

  return (
    <div className="space-y-6">
      <h1 className="title-page">{t("Settings")}</h1>

      <section className="space-y-3" aria-labelledby="signup-settings">
        <h2 id="signup-settings" className="title-section">{t("Sign-up")}</h2>
        <SignupApprovalForm required={requireApproval} />
      </section>

      <section className="space-y-3" aria-labelledby="price-settings">
        <h2 id="price-settings" className="title-section">{t("Price and limits")}</h2>
        <PriceForm cents={cents} />
        <DefaultLimitForm limit={limit} />
      </section>

      <section className="space-y-3" aria-labelledby="email-settings">
        <h2 id="email-settings" className="title-section">{t("E-mail")}</h2>
        <TestEmailForm adminEmail={adminEmail ?? ""} />
      </section>

      <section className="card p-5" aria-labelledby="settings-history">
        <h2 id="settings-history" className="title-section mb-3">{t("Settings history")}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">{t("No change yet.")}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table min-w-[560px]">
              <thead>
                <tr>
                  <th scope="col">{t("When")}</th>
                  <th scope="col">{t("Who")}</th>
                  <th scope="col">{t("Setting")}</th>
                  <th scope="col">{t("Before → after")}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-muted">{formatDate(log.createdAt, locale, true)}</td>
                    <td className="text-muted">{log.actorEmail}</td>
                    <td>{actionLabel[log.action] ?? log.action}</td>
                    <td className="text-xs text-muted">{valueOf(log.before)} → {valueOf(log.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
