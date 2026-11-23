"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { useI18n } from "@/lib/i18n/provider";

type Result =
  | { sent: true; to: string; from: string; provider: string; server: string | null; id: string | null }
  | { sent: false; to: string; from: string; provider: string; server: string | null; status: number | null; error: string };

const PROVIDER: Record<string, string> = { resend: "Resend", smtp: "SMTP", none: "—" };

/**
 * "Send test e-mail": goes through the same provider as every e-mail the app
 * sends, and shows what the provider answered, error included, word for word.
 */
export default function TestEmailForm({ adminEmail }: { adminEmail: string }) {
  const { t, message } = useI18n();
  const [to, setTo] = useState(adminEmail);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const via = (r: Result) => `${PROVIDER[r.provider] ?? r.provider}${r.server ? ` (${r.server})` : ""}`;

  return (
    <form
      className="card max-w-xl space-y-3 p-5"
      data-test-email
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        setResult(null);
        setError(null);
        const res = await fetch("/api/admin/email-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setSending(false);
        if (!data.success) {
          setError(message(data.error, "Could not send. Try again."));
          return;
        }
        setResult(data.data as Result);
      }}
    >
      <p className="text-sm text-muted">
        {t("Sends a message through the same provider as the sign-up, password and notice e-mails, and shows what the provider answered.")}
      </p>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">{t("Send to")}</span>
        <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} className="field" />
      </label>
      <button type="submit" disabled={sending} className="btn btn-primary">
        {sending ? t("Sending…") : t("Send test e-mail")}
      </button>
      {error && <p role="alert" className="text-[13px] text-error">{error}</p>}
      {result?.sent && (
        <div data-test-email-result="sent">
          <Alert tone="success" title={t("Sent")}>
            <p>{t("The provider accepted the e-mail to {to}. Check the inbox (and the spam folder).", { to: result.to })}</p>
            <p className="mt-1 break-all text-xs">
              {t("Provider: {provider}", { provider: via(result) })} · {t("Sender: {from}", { from: result.from })}
              {result.id ? ` · ID: ${result.id}` : ""}
            </p>
          </Alert>
        </div>
      )}
      {result && !result.sent && (
        <div data-test-email-result="failed">
          <Alert tone="error" title={t("Not sent")}>
            <p>{t("The provider refused or could not take the e-mail to {to}. Its answer:", { to: result.to })}</p>
            <pre className="mt-1.5 whitespace-pre-wrap break-all rounded-control border border-error-border bg-surface p-2.5 font-mono text-[12px] text-foreground">
              {result.status ? `${result.status} ` : ""}
              {result.error}
            </pre>
            <p className="mt-1.5 break-all text-xs">
              {t("Provider: {provider}", { provider: via(result) })} · {t("Sender: {from}", { from: result.from })}
            </p>
          </Alert>
        </div>
      )}
    </form>
  );
}
