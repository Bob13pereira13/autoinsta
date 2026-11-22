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
  const { rows, total, page, pageSize } = await listClients({ q: params.q, status: params.status, page: Number(params.page) || 1 });
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
        <h1 className="text-lg font-semibold">{t("Clients")}</h1>
        <Link href="/admin/clients/new" className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
          {t("New client")}
        </Link>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label htmlFor="q" className="sr-only">{t("Search")}</label>
        <input id="q" name="q" defaultValue={params.q ?? ""} placeholder={t("Company, name, e-mail, CPF/CNPJ or phone")} className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm" />
        <label htmlFor="status" className="sr-only">{t("Status")}</label>
        <select id="status" name="status" defaultValue={params.status ?? ""} className="rounded border border-border bg-surface px-3 py-2 text-sm">
          <option value="">{t("All statuses")}</option>
          <option value="PENDING_APPROVAL">{t("Awaiting approval")}</option>
          <option value="ACTIVE">{t("Enabled")}</option>
          <option value="DISABLED">{t("Disabled")}</option>
          <option value="REJECTED">{t("Rejected")}</option>
        </select>
        <button type="submit" className="rounded border border-border px-4 py-2 text-sm hover:bg-surface-hover">{t("Filter")}</button>
      </form>
      <p className="text-xs text-muted">{t("{count} clients", { count: total })}</p>
      <div className="panel overflow-x-auto rounded">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">{t("Client")}</th>
              <th className="px-4 py-3">{t("E-mail")}</th>
              <th className="px-4 py-3">{t("Status")}</th>
              <th className="px-4 py-3">{t("Accounts")}</th>
              <th className="px-4 py-3">{t("Automations")}</th>
              <th className="px-4 py-3">{t("Created")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">{t("No client found.")}</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-surface-hover/50">
                <td className="px-4 py-3">
                  <Link href={`/admin/clients/${row.id}`} className="font-medium text-foreground hover:underline">
                    {row.companyName ?? row.name}
                  </Link>
                  <span className="block text-xs text-muted">{row.owner.name ?? "—"}</span>
                </td>
                <td className="px-4 py-3 text-muted">
                  {row.owner.email}
                  {!row.owner.emailVerified && <span className="ml-1 rounded bg-warning/10 px-1.5 text-[10px] text-warning">{t("not confirmed")}</span>}
                </td>
                <td className="px-4 py-3"><ClientStatusBadge status={row.status} /></td>
                <td className="px-4 py-3 text-muted">{row._count.instagramAccounts} / {row.instagramAccountLimit}</td>
                <td className="px-4 py-3 text-muted">{row._count.automations}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(row.createdAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label={t("Pages")}>
          {page > 1 ? <Link href={link(page - 1)} className="text-accent hover:underline">{t("Previous")}</Link> : <span />}
          <span className="text-muted">{page} / {pages}</span>
          {page < pages ? <Link href={link(page + 1)} className="text-accent hover:underline">{t("Next")}</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
