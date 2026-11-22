import Link from "next/link";
import { ClientStatusBadge } from "@/components/admin/status-badge";
import { formatDate } from "@/components/admin/format";
import { listClients } from "@/lib/admin/clients";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const { rows, total, page, pageSize, defaultAccountLimit } = await listClients({ q: params.q, status: params.status, page: Number(params.page) || 1 });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (p: number) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.status) qs.set("status", params.status);
    qs.set("page", String(p));
    return `/admin/clients?${qs}`;
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="title-page">{t("Clients")}</h1>
        <Link href="/admin/clients/new" className="btn btn-primary">
          {t("New client")}
        </Link>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label htmlFor="q" className="sr-only">{t("Search")}</label>
        <input id="q" name="q" defaultValue={params.q ?? ""} placeholder={t("Company, name, e-mail, CPF/CNPJ or phone")} className="field flex-1" />
        <label htmlFor="status" className="sr-only">{t("Status")}</label>
        <select id="status" name="status" defaultValue={params.status ?? ""} className="field sm:!w-auto">
          <option value="">{t("All statuses")}</option>
          <option value="PENDING_APPROVAL">{t("Awaiting approval")}</option>
          <option value="ACTIVE">{t("Enabled")}</option>
          <option value="DISABLED">{t("Disabled")}</option>
          <option value="REJECTED">{t("Rejected")}</option>
        </select>
        <button type="submit" className="btn btn-secondary">{t("Filter")}</button>
      </form>
      <p className="text-xs text-faint">{t("{count} clients", { count: total })}</p>
      <div className="card table-scroll">
        <table className="data-table min-w-[720px]">
          <thead>
            <tr>
              <th scope="col">{t("Client")}</th>
              <th scope="col">{t("E-mail")}</th>
              <th scope="col">{t("Status")}</th>
              <th scope="col">{t("Accounts")}</th>
              <th scope="col">{t("Automations")}</th>
              <th scope="col">{t("Created")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="!py-8 text-center text-muted">{t("No client found.")}</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/admin/clients/${row.id}`} className="font-medium text-heading hover:text-accent-fg">
                    {row.companyName ?? row.name}
                  </Link>
                  <span className="block text-xs text-faint">{row.owner.name ?? "—"}</span>
                </td>
                <td className="text-muted">
                  {row.owner.email}
                  {!row.owner.emailVerified && <span className="ml-1 rounded-md border border-warning-border bg-warning-soft px-1.5 py-0.5 text-[11px] text-warning">{t("not confirmed")}</span>}
                </td>
                <td><ClientStatusBadge status={row.status} /></td>
                <td className="text-muted">
                  {(() => {
                    // The limit in effect: the client's own, or the default (∞ = no limit).
                    const limit = row.instagramAccountLimit ?? defaultAccountLimit;
                    return `${row._count.instagramAccounts} / ${limit ?? "∞"}`;
                  })()}
                  {row.instagramAccountLimit === null && <span className="ml-1 text-[11px] text-faint">({t("default")})</span>}
                </td>
                <td className="text-muted">{row._count.automations}</td>
                <td className="whitespace-nowrap text-muted">{formatDate(row.createdAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label={t("Pages")}>
          {page > 1 ? <Link href={link(page - 1)} className="text-accent-fg hover:text-accent-fg-hover hover:underline">{t("Previous")}</Link> : <span />}
          <span className="text-muted">{page} / {pages}</span>
          {page < pages ? <Link href={link(page + 1)} className="text-accent-fg hover:text-accent-fg-hover hover:underline">{t("Next")}</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
