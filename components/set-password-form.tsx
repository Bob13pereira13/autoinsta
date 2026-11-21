"use client";

import { useActionState } from "react";
import { useI18n } from "@/lib/i18n/provider";

export type SetPasswordState = { error: string | null };

export default function SetPasswordForm({
  action,
  token,
  submitLabel,
}: {
  action: (state: SetPasswordState, formData: FormData) => Promise<SetPasswordState>;
  token: string;
  submitLabel: string;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(action, { error: null });
  const inputClass =
    "w-full px-4 py-3 rounded bg-surface border border-border text-sm focus:border-accent/40 focus:outline-none";

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="rounded border border-error/20 bg-error/10 p-3 text-sm text-error">
          {state.error}
        </p>
      )}
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium">
          {t("New password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="text-xs text-muted">{t("At least 8 characters.")}</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="confirm" className="block text-sm font-medium">
          {t("Confirm the new password")}
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? t("Saving...") : submitLabel}
      </button>
    </form>
  );
}
