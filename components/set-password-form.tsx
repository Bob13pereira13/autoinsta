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
  const { t, message } = useI18n();
  const [state, formAction, pending] = useActionState(action, { error: null });
  const inputClass = "field";

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="rounded-control border border-error-border bg-error-soft px-4 py-3 text-sm text-error">
          {message(state.error)}
        </p>
      )}
      <div className="space-y-2">
        <label htmlFor="password" className="label">
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
        <label htmlFor="confirm" className="label">
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
        className="btn btn-primary w-full"
      >
        {pending ? t("Saving...") : submitLabel}
      </button>
    </form>
  );
}
