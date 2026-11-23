import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAccountControls, ClientStatusActions, LimitEditor, NotesEditor } from "@/components/admin/client-actions";
import WebhookCheckButton from "@/components/admin/webhook-check-button";
import { ClientStatusBadge } from "@/components/admin/status-badge";
import { formatDate, formatMoney } from "@/components/admin/format";
import { SYSTEM_ACTOR } from "@/lib/admin/audit";
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
    "client.autoActivate": t("Activated on e-mail confirmation (sign-up approval off)"),
    "client.reject": t("Rejected"),
    "client.activate": t("Activated"),
    "client.deactivate": t("Deactivated"),
    "client.limit": t("Account limit changed"),
    "client.notes": t("Notes edited"),
    "client.create": t("Client created by an admin"),
    "account.toggle": t("Instagram account switch"),
    "account.remove": t("Instagram account removed"),
    "settings.defaultLimit": t("Default account limit changed"),
  };
  const sourceLabel = ws.signupSource === "SELF_SIGNUP" ? t("Public sign-up") : ws.signupSource === "ADMIN" ? t("Created by an admin") : t("Before sign-up existed");
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[minmax(7rem,10rem)_1fr] gap-2 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-[13px] text-faint">
            <Link href="/admin/clients" className="rounded-sm text-accent-fg hover:text-accent-fg-hover">
              {t("Clients")}
            </Link>
          </p>
          <h1 className="title-page break-words">{ws.companyName ?? ws.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-muted">
            <ClientStatusBadge status={ws.status} />
            <span>{sourceLabel}</span>
          </div>
        </div>
        <ClientStatusActions clientId={ws.id} status={ws.status} />
      </div>
      {ws.status === "REJECTED" && ws.rejectionReason && (
        <p className="rounded-control border border-error-border bg-error-soft px-4 py-3 text-sm text-error">
          {t("Rejected on {date}. Reason: {reason}", { date: formatDate(ws.rejectedAt, locale), reason: ws.rejectionReason })}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="title-section mb-3">{t("Sign-up data")}</h2>
          <dl className="divide-y divide-border-subtle">
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
            {row(t("Phone (WhatsApp)"), ws.contactPhone ? <a className="text-accent-fg hover:text-accent-fg-hover hover:underline" href={`https://wa.me/${ws.contactPhone.replace(/\D/g, "")}`}>{ws.contactPhone}</a> : "—")}
            {row(t("CPF or CNPJ"), ws.documentType && ws.documentNumber ? `${ws.documentType} ${formatDocument(ws.documentType, ws.documentNumber)}` : t("not informed"))}
            {row(t("Terms accepted"), owner?.termsVersion ? t("version {version} on {date}", { version: owner.termsVersion, date: formatDate(owner.termsAcceptedAt, locale, true) }) : "—")}
            {row(t("Created"), formatDate(ws.createdAt, locale, true))}
            {row(t("Approved"), formatDate(ws.approvedAt, locale, true))}
          </dl>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="title-section">{t("Usage")}</h2>
          <dl className="divide-y divide-border-subtle">
            {row(t("Automations"), ws._count.automations)}
            {row(t("Sends (30 days)"), sendsLast30Days)}
            {row(t("Price per account"), ws.pricePerAccountCents !== null ? formatMoney(ws.pricePerAccountCents, locale) : t("{price} (default)", { price: formatMoney(platformPriceCents, locale) }))}
          </dl>
          <LimitEditor
            clientId={ws.id}
            own={detail.accountLimit.own}
            platformDefault={detail.accountLimit.platformDefault}
            connected={ws.instagramAccounts.length}
          />
        </section>
      </div>

      <section className="card p-5">
        <h2 className="title-section mb-3">{t("Instagram accounts")}</h2>
        {ws.instagramAccounts.length === 0 ? (
          <p className="text-sm text-muted">{t("No Instagram account connected")}</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {ws.instagramAccounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-display text-base font-semibold text-heading">@{account.username}</p>
                  <p className="text-xs text-faint">
                    {t(account._count.automations === 1 ? "{count} automation" : "{count} automations", { count: account._count.automations })} ·{" "}
                    {t("connected on {date}", { date: formatDate(account.connectedAt, locale) })}
                    {account.tokenInvalidAt && <span className="ml-1 text-error">· {t("access expired")}</span>}
                  </p>
                </div>
                <AdminAccountControls clientId={ws.id} accountId={account.id} username={account.username} enabled={account.automationsEnabled} automations={account._count.automations} />
                <WebhookCheckButton clientId={ws.id} accountId={account.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="title-section mb-3">{t("Members")}</h2>
          <ul className="divide-y divide-border-subtle text-sm">
            {ws.members.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span>{m.user.name ?? "—"} · {m.user.email}</span>
                <span className="text-xs text-faint">{m.role}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="title-section mb-3">{t("Internal notes")}</h2>
          <NotesEditor clientId={ws.id} notes={ws.internalNotes} />
        </section>
      </div>

      <section className="card p-5">
        <h2 className="title-section mb-3">{t("Audit log")}</h2>
        {ws.adminAuditLogs.length === 0 ? (
          <p className="text-sm text-muted">{t("No admin action yet.")}</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th scope="col">{t("When")}</th>
                  <th scope="col">{t("Who")}</th>
                  <th scope="col">{t("Action")}</th>
                  <th scope="col">{t("Before → after")}</th>
                </tr>
              </thead>
              <tbody>
                {ws.adminAuditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-muted">{formatDate(log.createdAt, locale, true)}</td>
                    <td className="text-muted">{log.actorEmail === SYSTEM_ACTOR ? t("Automatic") : log.actorEmail}</td>
                    <td>
                      {actionLabel[log.action] ?? log.action}
                      {log.reason && <span className="block text-xs text-faint">{t("Reason: {reason}", { reason: log.reason })}</span>}
                    </td>
                    <td className="text-xs text-muted">{describe(log.before)} → {describe(log.after)}</td>
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
