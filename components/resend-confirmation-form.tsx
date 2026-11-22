"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

export default function ResendConfirmationForm({ defaultEmail }: { defaultEmail: string }) {
  const { t, message } = useI18n();
  const [email, setEmail] = useState(defaultEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/signup/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) setSent(true);
      else setError(message(data.error, "Could not send. Try again."));
    } catch {
      setError(t("Could not send. Try again."));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <p role="status" className="rounded border border-success/20 bg-success/10 p-3 text-sm text-success">
        {t("If this e-mail has a sign-up waiting for confirmation, a new link is on its way.")}
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <label htmlFor="resend-email" className="sr-only">
        {t("E-mail")}
      </label>
      <input
        id="resend-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded border border-border bg-surface px-4 py-3 text-sm text-foreground focus:border-accent/40 focus:outline-none"
      />
      <button type="submit" disabled={sending} className="w-full rounded border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-surface-hover disabled:opacity-60">
        {sending ? t("Sending…") : t("Resend the link")}
      </button>
    </form>
  );
}
