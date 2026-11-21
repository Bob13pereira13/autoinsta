"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

/** Settings card: change the password (or set one, for magic-link-only users). */
export default function ChangePasswordCard() {
  const { t } = useI18n();
  const [account, setAccount] = useState<{ email: string | null; hasPassword: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/account/password")
      .then((res) => res.json())
      .then((payload) => payload.success && setAccount(payload.data))
      .catch(() => {});
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== form.get("confirm")) {
      setError(t("The passwords do not match."));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: form.get("currentPassword") ?? "", newPassword }),
    });
    const payload = await res.json().catch(() => ({}));
    if (payload.success) {
      // Every session ends on a password change; sign in again.
      window.location.href = "/login?passwordChanged=1";
      return;
    }
    setError(payload.error ?? t("Could not change the password."));
    setBusy(false);
  }

  const inputClass =
    "w-full px-3 py-2 rounded bg-background border border-border text-sm focus:border-accent/40 focus:outline-none";

  return (
    <section className="panel rounded p-4 sm:p-6">
      <h2 className="text-base font-semibold">{t("Your account")}</h2>
      {account?.email && <p className="mt-1 text-sm text-muted">{account.email}</p>}
      <form onSubmit={submit} className="mt-5 space-y-3">
        <h3 className="text-sm font-medium">
          {account?.hasPassword === false ? t("Set a password") : t("Change password")}
        </h3>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        {account?.hasPassword !== false && (
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            placeholder={t("Current password")}
            aria-label={t("Current password")}
            className={inputClass}
          />
        )}
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          placeholder={t("New password")}
          aria-label={t("New password")}
          className={inputClass}
        />
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          placeholder={t("Confirm the new password")}
          aria-label={t("Confirm the new password")}
          className={inputClass}
        />
        <p className="text-xs text-muted">
          {t("At least 8 characters. You will be signed out of all devices.")}
        </p>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? t("Saving...") : t("Save password")}
        </button>
      </form>
    </section>
  );
}
