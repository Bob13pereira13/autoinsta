import { formatDate } from "@/components/admin/format";
import type { I18n } from "@/lib/i18n";
import type { ReceiptsReport } from "@/lib/webhooks/receipts-report";

/**
 * Diagnostics → "Notifications from Meta (last 24 h)": what arrived, what was
 * accepted or discarded and why, and for unknown entry ids what arrived and a
 * proposed mapping. Answers "does Meta not send it, or does the app discard it?".
 */
export function WebhookReceiptsSection({ report, t, locale }: { report: ReceiptsReport; t: I18n["t"]; locale: string }) {
  const counts = (record: Record<string, number>) =>
    Object.entries(record)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(" · ") || "—";
  const reasonText = (reason: string | null) =>
    reason === "unknown_account"
      ? t("account not connected (entry id matches no account)")
      : reason === "object_not_instagram"
        ? t("object is not “instagram”")
        : reason === "invalid_json"
          ? t("invalid JSON")
          : reason === "no_entries"
            ? t("no entries")
            : reason === "no_entry_id"
              ? t("entry without id")
              : (reason ?? "—");
  const whyText = (why: NonNullable<ReceiptsReport["unknown"][number]["proposal"]>["why"]) =>
    why === "business_id_inside"
      ? t("the messages inside name this account as the business side")
      : why === "app_scoped_id"
        ? t("it is the account's app-scoped id")
        : t("it is the login's user id");

  const verdict =
    report.total === 0
      ? { tone: "text-muted", text: t("Nothing arrived from Meta in the last 24 hours.") }
      : report.messages === "none"
        ? { tone: "text-warning", text: t("No message notification (messages, echoes, button taps) arrived in the last 24 hours: Meta did not send any. The app discarded none.") }
        : report.messages === "accepted"
          ? { tone: "text-success", text: t("Message notifications arrived and were accepted.") }
          : report.messages === "discarded_only"
            ? { tone: "text-error", text: t("Message notifications arrived and the app discarded all of them: see the unknown ids below.") }
            : { tone: "text-warning", text: t("Message notifications arrived; some were discarded: see the unknown ids below.") };

  return (
    <section className="card p-5 sm:p-6" data-webhook-receipts>
      <h2 className="title-section">{t("Notifications from Meta (last 24 h)")}</h2>
      <p className="mt-1 text-xs text-faint">
        {t("Every signed POST to /api/webhook: object, entry ids, keys and fields, accepted or discarded. No message text and no ids of people. Kept 24 hours.")}
      </p>

      <p className={`mt-4 text-sm font-semibold ${verdict.tone}`} data-webhook-verdict={report.messages}>
        {verdict.text}
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-faint">{t("Received")}</dt>
          <dd>
            {t("{total} · accepted {accepted} · discarded {discarded}", { total: report.total, accepted: report.accepted, discarded: report.discarded })}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-faint">{t("Discarded by reason")}</dt>
          <dd className="break-words">
            {Object.keys(report.discardedBy).length
              ? Object.entries(report.discardedBy)
                  .map(([reason, n]) => `${reasonText(reason)}: ${n}`)
                  .join(" · ")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-faint">{t("Fields of “changes” that arrived")}</dt>
          <dd className="break-words font-mono text-xs">{counts(report.arrived.fields)}</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">{t("“messaging” items that arrived")}</dt>
          <dd className="break-words font-mono text-xs">{counts(report.arrived.messaging)}</dd>
        </div>
      </dl>

      {report.unknown.length > 0 && (
        <div className="mt-5 space-y-3" data-webhook-unknown>
          <h3 className="text-sm font-semibold text-heading">{t("Discarded entry ids (nothing is changed)")}</h3>
          <ul className="space-y-3">
            {report.unknown.map((entry) => (
              <li key={`${entry.object}:${entry.id}`} className="rounded-control border border-border-subtle bg-surface p-3 text-xs">
                <p className="break-all font-mono text-sm text-foreground">
                  {entry.object ?? "—"} · {entry.id}
                </p>
                <p className="mt-1 text-muted">
                  {reasonText(entry.reason)} · {entry.count === 1
                    ? t("once, last {date}", { date: formatDate(entry.lastAt, locale, true) })
                    : t("{count} times, last {date}", { count: entry.count, date: formatDate(entry.lastAt, locale, true) })}
                </p>
                <p className="mt-1 break-words font-mono text-muted">
                  keys: {entry.keys.join(", ") || "—"} · fields: {entry.fields.join(", ") || "—"} · messaging: {counts(entry.messaging)}
                </p>
                {entry.otherBusinessIds.length > 0 && (
                  <p className="mt-1 break-all font-mono text-muted">
                    {t("Business id inside the messages:")} {entry.otherBusinessIds.join(", ")}
                  </p>
                )}
                <p className={`mt-2 ${entry.proposal ? "text-foreground" : "text-muted"}`} data-webhook-proposal={entry.proposal ? "match" : "none"}>
                  {entry.proposal
                    ? t("Proposed mapping: {id} → @{username} (saved id {saved}{client}), because {why}.", {
                        id: entry.id,
                        username: entry.proposal.username,
                        saved: entry.proposal.instagramId,
                        client: entry.proposal.client ? ` · ${entry.proposal.client}` : "",
                        why: whyText(entry.proposal.why),
                      })
                    : t("No connected account matches this id. Compare it with the saved ids in the client's page; nothing was changed.")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-5 text-sm">
        <summary className="cursor-pointer text-muted">{t("Last {count} received", { count: report.recent.length })}</summary>
        {report.recent.length === 0 ? (
          <p className="mt-2 text-muted">—</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle">
            {report.recent.map((row) => (
              <li key={row.id} className="py-2.5 text-xs">
                <p className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="text-faint">{formatDate(row.createdAt, locale, true)}</span>
                  <span className="font-mono">{row.object ?? "—"}</span>
                  <span className={row.accepted ? "text-success" : "text-warning"}>
                    {row.accepted ? t("accepted") : `${t("discarded")}${row.reason ? `: ${reasonText(row.reason)}` : ""}`}
                  </span>
                </p>
                {row.entries.map((entry, i) => (
                  <p key={i} className="mt-1 break-all font-mono text-muted">
                    {entry.id ?? "—"} · {entry.keys.join(",")}
                    {entry.fields.length ? ` · fields: ${entry.fields.join(",")}` : ""}
                    {Object.keys(entry.messaging).length ? ` · messaging: ${counts(entry.messaging)}` : ""}
                    {Object.keys(entry.standby).length ? ` · standby: ${counts(entry.standby)}` : ""}
                    {entry.accepted ? "" : ` · ${reasonText(entry.reason)}`}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
