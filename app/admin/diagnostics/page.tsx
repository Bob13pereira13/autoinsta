import Link from "next/link";
import StatusBadge from "@/components/status-badge";
import { formatDate } from "@/components/admin/format";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getDiagnostics, type DiagnosticsClient } from "@/lib/admin/diagnostics";
import { getI18n } from "@/lib/i18n/server";
import { logReasonText } from "@/lib/dm-logs/reasons";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="title-section">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-5 text-center text-sm text-muted">{label}</p>;
}

/** Which client an event belongs to (links to the client); nothing for platform-wide events. */
function ClientTag({ client }: { client: DiagnosticsClient | null }) {
  if (!client) return null;
  return (
    <Link href={`/admin/clients/${client.id}`} className="rounded-sm text-xs font-medium text-accent-fg hover:text-accent-fg-hover hover:underline">
      {client.name}
    </Link>
  );
}

/**
 * Production diagnostics for the operators: every client's events, or one
 * client's (?workspaceId=). Customers no longer see this page.
 */
export default async function AdminDiagnosticsPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const { t, label, locale } = await getI18n();
  const params = await searchParams;
  const data = await getDiagnostics({ workspaceId: params.workspaceId });
  const workerAgeSeconds = data.workerHealth.ageMs == null ? null : Math.round(data.workerHealth.ageMs / 1000);
  const here = data.filter ? `/admin/diagnostics?workspaceId=${encodeURIComponent(data.filter)}` : "/admin/diagnostics";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Production Diagnostics")}
        description={t("Health, queues, webhook failures, operational events and worker alerts.")}
        actions={
          <ButtonLink href={here} icon="refresh" prefetch={false}>
            {t("Refresh")}
          </ButtonLink>
        }
      />

      <form method="get" action="/admin/diagnostics" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1.5 sm:max-w-sm">
          <span className="label">{t("Client")}</span>
          <select name="workspaceId" defaultValue={data.filter ?? ""} className="field">
            <option value="">{t("All clients")}</option>
            {data.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary">
          {t("Filter")}
        </button>
      </form>

      {data.brandMissingFields.length > 0 && (
        <div role="alert" className="rounded-control border border-warning-border bg-warning-soft p-4 text-sm text-warning">
          <p className="font-semibold">{t("Brand configuration incomplete")}</p>
          <p className="mt-1">{t("Fill these fields in config/brand.ts before going live and before submitting to Meta App Review:")}</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {data.brandMissingFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        <div className="card p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">{t("Worker health")}</p>
          <p className={`mt-2 font-display text-2xl font-semibold ${data.workerHealth.healthy ? "text-success" : "text-warning"}`}>
            {data.workerHealth.healthy ? t("Healthy") : t("Needs attention")}
          </p>
          <p className="mt-2 text-xs text-faint">
            {workerAgeSeconds == null ? t("No heartbeat found") : t("Last heartbeat {seconds}s ago", { seconds: workerAgeSeconds })}
          </p>
        </div>
        {(["waiting", "active", "delayed", "failed"] as const).map((key) => (
          <div key={key} className="card p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">
              {t("Queue")} {label(key)}
            </p>
            <p className="mt-2 font-display text-[28px] font-semibold text-heading">{data.queueCounts[key] ?? 0}</p>
          </div>
        ))}
      </div>

      <Section title={t("Recent Worker Alerts")}>
        {data.workerAlerts.length ? (
          <ul className="space-y-3">
            {data.workerAlerts.map((alert) => (
              <li key={`${alert.createdAt}-${alert.jobId ?? alert.message}`} className="rounded-control border border-border-subtle bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 flex-1 break-words text-sm font-semibold text-heading">{alert.message}</p>
                  <span className="shrink-0 rounded-full border border-error-border bg-error-soft px-2 py-0.5 text-xs font-semibold text-error">{alert.level}</span>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-faint">
                  <ClientTag client={alert.client} />
                  <span>
                    {formatDate(alert.createdAt, locale, true)}
                    {alert.commentId ? ` · ${alert.commentId}` : ""}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty label={t("No worker alerts recorded.")} />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t("Campaign DM Failures And Skips")}>
          {data.dmFailures.length ? (
            <ul className="space-y-3">
              {data.dmFailures.map((item) => (
                <li key={item.id} className="border-b border-border-subtle pb-3 last:border-0">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-heading">{item.automation.name}</p>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">{item.commentText}</p>
                  {item.errorMessage && (
                    <>
                      <p className="mt-1 text-xs text-error">{logReasonText(item.errorMessage, t)}</p>
                      {/* For support: what was stored (Meta's own text, codes). */}
                      <p className="mt-0.5 break-words font-mono text-[11px] text-faint">{t("Technical detail: {detail}", { detail: item.errorMessage })}</p>
                    </>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-faint">
                    <ClientTag client={item.client} />
                    <span>{formatDate(item.updatedAt, locale, true)}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty label={t("No DM failures or skips.")} />
          )}
        </Section>

        <Section title={t("Webhook Failures")}>
          {data.webhookFailures.length ? (
            <ul className="space-y-3">
              {data.webhookFailures.map((event) => (
                <li key={event.id} className="border-b border-border-subtle pb-3 last:border-0">
                  <p className="text-sm font-semibold text-heading">{event.object ?? t("Instagram webhook")}</p>
                  <p className="mt-1 text-xs text-error">{event.errorMessage ?? t("Unknown error")}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-faint">
                    <ClientTag client={event.client} />
                    <span>{formatDate(event.createdAt, locale, true)}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty label={t("No failed webhook events.")} />
          )}
        </Section>
      </div>

      <Section title={t("Token Refresh Failures")}>
        {data.tokenRefreshFailures.length ? (
          <ul className="space-y-3">
            {data.tokenRefreshFailures.map((event) => (
              <li key={event.id} className="border-b border-border-subtle pb-3 last:border-0">
                <p className="text-sm font-semibold text-heading">{event.message}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-faint">
                  <ClientTag client={event.client} />
                  <span>{formatDate(event.createdAt, locale, true)}</span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty label={t("No token refresh failures.")} />
        )}
      </Section>

      <Section title={t("Operational Event Timeline")}>
        {data.operationalEvents.length ? (
          <ul className="space-y-3">
            {data.operationalEvents.map((event) => (
              <li key={event.id} className="grid gap-1 border-b border-border-subtle pb-3 last:border-0 sm:grid-cols-[140px_1fr_auto] sm:gap-3">
                <p className="text-xs font-semibold text-muted">{event.source}</p>
                <div className="min-w-0">
                  <p className="break-words text-sm text-foreground">{event.message}</p>
                  <ClientTag client={event.client} />
                  {event.payload != null && (
                    <details className="mt-1.5 text-xs" data-event-payload>
                      <summary className="cursor-pointer text-muted">{t("Details")}</summary>
                      <pre className="mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-control border border-border-subtle bg-surface p-2.5 font-mono text-[11px] leading-relaxed text-foreground">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
                <p className="text-xs text-faint">{formatDate(event.createdAt, locale, true)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty label={t("No operational events recorded.")} />
        )}
      </Section>
    </div>
  );
}
