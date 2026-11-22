"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

/** Settings card: change the password (or set one, for magic-link-only users). */
export default function ChangePasswordCard() {
  const { t, message } = useI18n();
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
    setError(message(payload.error, "Could not change the password."));
    setBusy(false);
  }

  const inputClass = "field";

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="title-section">{t("Your account")}</h2>
      {account?.email && <p className="mt-1 text-sm text-muted">{account.email}</p>}
      <form onSubmit={submit} className="mt-5 space-y-3">
        <h3 className="font-semibold text-heading">
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
        <p className="hint">
          {t("At least 8 characters. You will be signed out of all devices.")}
        </p>
        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary"
        >
          {busy ? t("Saving...") : t("Save password")}
        </button>
      </form>
    </section>
  );
}
