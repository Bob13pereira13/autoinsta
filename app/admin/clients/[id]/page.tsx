import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAccountControls, ClientStatusActions, LimitEditor, NotesEditor } from "@/components/admin/client-actions";
import { ClientStatusBadge } from "@/components/admin/status-badge";
import { formatDate, formatMoney } from "@/components/admin/format";
import { getClientDetail } from "@/lib/admin/clients";
import { getI18n } from "@/lib/i18n/server";
import { formatDocument } from "@/lib/validation/document";

export const dynamic = "force-dynamic";

function describe(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "object") return String(value);
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${v === null ? "—" : String(v)}`)
    .join(", ");
}

export default async function AdminClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t, locale } = await getI18n();
  const detail = await getClientDetail(id);
  if (!detail) notFound();
  const { workspace: ws, sendsLast30Days, platformPriceCents } = detail;
  const owner = ws.members.find((m) => m.role === "OWNER")?.user ?? ws.members[0]?.user;
  const actionLabel: Record<string, string> = {
    "client.approve": t("Approved"),
    "client.reject": t("Rejected"),
    "client.activate": t("Activated"),
    "client.deactivate": t("Deactivated"),
    "client.limit": t("Account limit changed"),
    "client.notes": t("Notes edited"),
    "client.create": t("Client created by an admin"),
    "account.toggle": t("Instagram account switch"),
    "account.remove": t("Instagram account removed"),
  };
  const sourceLabel = ws.signupSource === "SELF_SIGNUP" ? t("Public sign-up") : ws.signupSource === "ADMIN" ? t("Created by an admin") : t("Before sign-up existed");
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </div>
  );

  return (
    <div className="space-y-6">
      <Link href="/admin/clients" className="text-sm text-muted hover:text-foreground">← {t("Clients")}</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{ws.companyName ?? ws.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <ClientStatusBadge status={ws.status} />
            <span>{sourceLabel}</span>
          </div>
        </div>
        <ClientStatusActions clientId={ws.id} status={ws.status} />
      </div>
      {ws.status === "REJECTED" && ws.rejectionReason && (
        <p className="rounded border border-error/30 bg-error/10 p-3 text-sm text-error">
          {t("Rejected on {date}. Reason: {reason}", { date: formatDate(ws.rejectedAt, locale), reason: ws.rejectionReason })}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded p-5">
          <h2 className="mb-3 text-base font-semibold">{t("Sign-up data")}</h2>
          <dl className="divide-y divide-border">
            {row(t("Name"), owner?.name ?? "—")}
            {row(t("E-mail"), (
              <>
                {owner?.email ?? "—"}{" "}
                <span className={`text-xs ${owner?.emailVerified ? "text-success" : "text-warning"}`}>
                  {owner?.emailVerified ? t("confirmed") : t("not confirmed")}
                </span>
              </>
            ))}
            {row(t("Company name"), ws.companyName ?? "—")}
            {row(t("Phone (WhatsApp)"), ws.contactPhone ? <a className="text-accent hover:underline" href={`https://wa.me/${ws.contactPhone.replace(/\D/g, "")}`}>{ws.contactPhone}</a> : "—")}
            {row(t("CPF or CNPJ"), ws.documentType && ws.documentNumber ? `${ws.documentType} ${formatDocument(ws.documentType, ws.documentNumber)}` : t("not informed"))}
            {row(t("Terms accepted"), owner?.termsVersion ? t("version {version} on {date}", { version: owner.termsVersion, date: formatDate(owner.termsAcceptedAt, locale, true) }) : "—")}
            {row(t("Created"), formatDate(ws.createdAt, locale, true))}
            {row(t("Approved"), formatDate(ws.approvedAt, locale, true))}
          </dl>
        </section>

        <section className="panel space-y-4 rounded p-5">
          <h2 className="text-base font-semibold">{t("Usage")}</h2>
          <dl className="divide-y divide-border">
            {row(t("Automations"), ws._count.automations)}
            {row(t("Sends (30 days)"), sendsLast30Days)}
            {row(t("Price per account"), ws.pricePerAccountCents !== null ? formatMoney(ws.pricePerAccountCents, locale) : t("{price} (default)", { price: formatMoney(platformPriceCents, locale) }))}
          </dl>
          <LimitEditor clientId={ws.id} limit={ws.instagramAccountLimit} connected={ws.instagramAccounts.length} />
        </section>
      </div>

      <section className="panel rounded p-5">
        <h2 className="mb-3 text-base font-semibold">{t("Instagram accounts")}</h2>
        {ws.instagramAccounts.length === 0 ? (
          <p className="text-sm text-muted">{t("No Instagram account connected")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {ws.instagramAccounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">@{account.username}</p>
                  <p className="text-xs text-muted">
                    {t(account._count.automations === 1 ? "{count} automation" : "{count} automations", { count: account._count.automations })} ·{" "}
                    {t("connected on {date}", { date: formatDate(account.connectedAt, locale) })}
                    {account.tokenInvalidAt && <span className="ml-1 text-error">· {t("access expired")}</span>}
                  </p>
                </div>
                <AdminAccountControls clientId={ws.id} accountId={account.id} username={account.username} enabled={account.automationsEnabled} automations={account._count.automations} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded p-5">
          <h2 className="mb-3 text-base font-semibold">{t("Members")}</h2>
          <ul className="divide-y divide-border text-sm">
            {ws.members.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{m.user.name ?? "—"} · {m.user.email}</span>
                <span className="text-xs text-muted">{m.role}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel rounded p-5">
          <h2 className="mb-3 text-base font-semibold">{t("Internal notes")}</h2>
          <NotesEditor clientId={ws.id} notes={ws.internalNotes} />
        </section>
      </div>

      <section className="panel rounded p-5">
        <h2 className="mb-3 text-base font-semibold">{t("Audit log")}</h2>
        {ws.adminAuditLogs.length === 0 ? (
          <p className="text-sm text-muted">{t("No admin action yet.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">{t("When")}</th>
                  <th className="py-2 pr-4">{t("Who")}</th>
                  <th className="py-2 pr-4">{t("Action")}</th>
                  <th className="py-2 pr-4">{t("Before → after")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ws.adminAuditLogs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="whitespace-nowrap py-2 pr-4 text-muted">{formatDate(log.createdAt, locale, true)}</td>
                    <td className="py-2 pr-4 text-muted">{log.actorEmail}</td>
                    <td className="py-2 pr-4">
                      {actionLabel[log.action] ?? log.action}
                      {log.reason && <span className="block text-xs text-muted">{t("Reason: {reason}", { reason: log.reason })}</span>}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted">{describe(log.before)} → {describe(log.after)}</td>
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
