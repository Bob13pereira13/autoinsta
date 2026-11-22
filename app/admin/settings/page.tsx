import DefaultLimitForm from "@/components/admin/default-limit-form";
import { formatDate, formatMoney } from "@/components/admin/format";
import PriceForm from "@/components/admin/price-form";
import SignupApprovalForm from "@/components/admin/signup-approval-form";
import { getDefaultAccountLimit } from "@/lib/account-limit";
import { getPlatformPriceCents, listSettingsAudit } from "@/lib/admin/clients";
import { getI18n } from "@/lib/i18n/server";
import { getRequireSignupApproval } from "@/lib/signup-approval";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const { t, locale } = await getI18n();
  const [cents, limit, requireApproval, history] = await Promise.all([
    getPlatformPriceCents(),
    getDefaultAccountLimit(),
    getRequireSignupApproval(),
    listSettingsAudit(),
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
      <h1 className="text-lg font-semibold">{t("Settings")}</h1>

      <section className="space-y-3" aria-labelledby="signup-settings">
        <h2 id="signup-settings" className="text-base font-semibold">{t("Sign-up")}</h2>
        <SignupApprovalForm required={requireApproval} />
      </section>

      <section className="space-y-3" aria-labelledby="price-settings">
        <h2 id="price-settings" className="text-base font-semibold">{t("Price and limits")}</h2>
        <PriceForm cents={cents} />
        <DefaultLimitForm limit={limit} />
      </section>

      <section className="panel rounded p-5" aria-labelledby="settings-history">
        <h2 id="settings-history" className="mb-3 text-base font-semibold">{t("Settings history")}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">{t("No change yet.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">{t("When")}</th>
                  <th className="py-2 pr-4">{t("Who")}</th>
                  <th className="py-2 pr-4">{t("Setting")}</th>
                  <th className="py-2 pr-4">{t("Before → after")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="whitespace-nowrap py-2 pr-4 text-muted">{formatDate(log.createdAt, locale, true)}</td>
                    <td className="py-2 pr-4 text-muted">{log.actorEmail}</td>
                    <td className="py-2 pr-4">{actionLabel[log.action] ?? log.action}</td>
                    <td className="py-2 pr-4 text-xs text-muted">{valueOf(log.before)} → {valueOf(log.after)}</td>
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
