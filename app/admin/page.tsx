import Link from "next/link";
import { ClientStatusActions } from "@/components/admin/client-actions";
import { formatDate, formatMoney } from "@/components/admin/format";
import { adminOverview } from "@/lib/admin/clients";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const { t, locale } = await getI18n();
  const data = await adminOverview();
  const cards = [
    { label: t("Awaiting approval"), value: data.clientsByStatus.PENDING_APPROVAL, href: "/admin/clients?status=PENDING_APPROVAL" },
    { label: t("Enabled"), value: data.clientsByStatus.ACTIVE, href: "/admin/clients?status=ACTIVE" },
    { label: t("Disabled"), value: data.clientsByStatus.DISABLED, href: "/admin/clients?status=DISABLED" },
    { label: t("Rejected"), value: data.clientsByStatus.REJECTED, href: "/admin/clients?status=REJECTED" },
  ];
  return (
    <div className="space-y-8">
      <section aria-labelledby="clients-heading" className="space-y-3">
        <h1 id="clients-heading" className="text-lg font-semibold">{t("Clients")}</h1>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map((card) => (
            <Link key={card.label} href={card.href} className="panel rounded p-4 hover:border-border-hover">
              <p className="text-sm text-muted">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold">{card.value}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="panel rounded p-4">
          <p className="text-sm text-muted">{t("Instagram accounts connected")}</p>
          <p className="mt-1 text-2xl font-semibold">{data.accounts.connected}</p>
          <p className="mt-1 text-xs text-muted">{t("{count} with the switch Active", { count: data.accounts.switchedOn })}</p>
        </div>
        <div className="panel rounded p-4">
          <p className="text-sm text-muted">{t("New sign-ups (30 days)")}</p>
          <p className="mt-1 text-2xl font-semibold">{data.newSignupsLast30Days}</p>
        </div>
        <div className="panel rounded p-4">
          <p className="text-sm text-muted">{t("Estimated monthly revenue")}</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(data.estimatedRevenueCents, locale)}</p>
          <p className="mt-1 text-xs text-muted">
            {t("Active clients: {limit} contracted accounts (sum of limits) × price. Default price {price} per account.", {
              limit: data.billableAccounts,
              price: formatMoney(data.pricePerAccountCents, locale),
            })}
          </p>
          <p className="mt-1 text-xs text-muted">
            {t("For information: {connected} connected, {on} with the switch Active.", {
              connected: data.activeClientAccounts.connected,
              on: data.activeClientAccounts.switchedOn,
            })}
          </p>
        </div>
      </section>

      <section aria-labelledby="pending-heading" className="space-y-3">
        <h2 id="pending-heading" className="text-base font-semibold">{t("Awaiting approval")}</h2>
        {data.pending.length === 0 ? (
          <p className="panel rounded p-6 text-sm text-muted">{t("No sign-up waiting for approval.")}</p>
        ) : (
          <ul className="space-y-3">
            {data.pending.map((client) => (
              <li key={client.id} className="panel flex flex-wrap items-start justify-between gap-3 rounded p-4">
                <div className="min-w-[14rem]">
                  <Link href={`/admin/clients/${client.id}`} className="font-semibold text-foreground hover:underline">
                    {client.companyName ?? client.name}
                  </Link>
                  <p className="text-sm text-muted">
                    {client.owner.name} · {client.owner.email}
                  </p>
                  <p className="text-xs text-muted">
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
