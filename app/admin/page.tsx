import Link from "next/link";
import { ClientStatusActions } from "@/components/admin/client-actions";
import { formatDate, formatMoney } from "@/components/admin/format";
import { adminOverview } from "@/lib/admin/clients";
import { getI18n } from "@/lib/i18n/server";
import { getRequireSignupApproval } from "@/lib/signup-approval";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const { t, locale } = await getI18n();
  const [data, requireApproval] = await Promise.all([adminOverview(), getRequireSignupApproval()]);
  const cards = [
    { label: t("Awaiting approval"), value: data.clientsByStatus.PENDING_APPROVAL, href: "/admin/clients?status=PENDING_APPROVAL" },
    { label: t("Enabled"), value: data.clientsByStatus.ACTIVE, href: "/admin/clients?status=ACTIVE" },
    { label: t("Disabled"), value: data.clientsByStatus.DISABLED, href: "/admin/clients?status=DISABLED" },
    { label: t("Rejected"), value: data.clientsByStatus.REJECTED, href: "/admin/clients?status=REJECTED" },
  ];
  return (
    <div className="space-y-8">
      <section aria-labelledby="clients-heading" className="space-y-3">
        <h1 id="clients-heading" className="title-page">{t("Clients")}</h1>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map((card) => (
            <Link key={card.label} href={card.href} className="card card-interactive p-4">
              <p className="text-sm text-muted">{card.label}</p>
              <p className="mt-1 font-display text-[28px] font-semibold text-heading">{card.value}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-muted">{t("Instagram accounts connected")}</p>
          <p className="mt-1 font-display text-[28px] font-semibold text-heading">{data.accounts.connected}</p>
          <p className="mt-1 text-xs text-faint">{t("{count} with the switch Active", { count: data.accounts.switchedOn })}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted">{t("New sign-ups (30 days)")}</p>
          <p className="mt-1 font-display text-[28px] font-semibold text-heading">{data.newSignupsLast30Days}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-muted">{t("Estimated monthly revenue")}</p>
          <p className="mt-1 font-display text-[28px] font-semibold text-heading">{formatMoney(data.estimatedRevenueCents, locale)}</p>
          <p className="mt-1 text-xs text-faint">
            {t("Active clients: {accounts} billable accounts × price (with a limit: the limit; without: the connected accounts). Default price {price} per account.", {
              accounts: data.billableAccounts,
              price: formatMoney(data.pricePerAccountCents, locale),
            })}
          </p>
          <p className="mt-1 text-xs text-faint">
            {t("{limited} with a limit, {unlimited} without a limit (default: {limit}).", {
              limited: data.limitedClients,
              unlimited: data.unlimitedClients,
              limit: data.defaultAccountLimit === null ? t("No limit") : String(data.defaultAccountLimit),
            })}
          </p>
          <p className="mt-1 text-xs text-faint">
            {t("For information: {connected} connected, {on} with the switch Active.", {
              connected: data.activeClientAccounts.connected,
              on: data.activeClientAccounts.switchedOn,
            })}
          </p>
        </div>
      </section>

      <section aria-labelledby="pending-heading" className="space-y-3">
        <h2 id="pending-heading" className="title-section">{t("Awaiting approval")}</h2>
        <p className="text-sm text-muted">
          {requireApproval
            ? t("Approval of new sign-ups is on: each confirmed sign-up waits here.")
            : t("Approval of new sign-ups is off: confirmed sign-ups become active right away. Only clients that were already waiting are listed here.")}{" "}
          <Link href="/admin/settings" className="text-accent-fg hover:text-accent-fg-hover hover:underline">{t("Change in Settings")}</Link>
        </p>
        {data.pending.length === 0 ? (
          <p className="card p-6 text-sm text-muted">{t("No sign-up waiting for approval.")}</p>
        ) : (
          <ul className="space-y-3">
            {data.pending.map((client) => (
              <li key={client.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-[14rem]">
                  <Link href={`/admin/clients/${client.id}`} className="font-display text-base font-semibold text-heading hover:text-accent-fg">
                    {client.companyName ?? client.name}
                  </Link>
                  <p className="text-sm text-muted">
                    {client.owner.name} · {client.owner.email}
                  </p>
                  <p className="text-xs text-faint">
                    {client.contactPhone ?? "—"} · {t("Signed up on {date}", { date: formatDate(client.createdAt, locale) })}
                  </p>
                </div>
                <ClientStatusActions clientId={client.id} status="PENDING_APPROVAL" compact />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
