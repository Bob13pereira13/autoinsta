"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

/** "Require approval of new sign-ups" (off by default). Each change is audited. */
export default function SignupApprovalForm({ required }: { required: boolean }) {
  const { t, message } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState(required);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card max-w-md space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setState("saving");
        const res = await fetch("/api/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requireSignupApproval: value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.success) {
          setState("idle");
          setError(message(data.error, "Could not save. Try again."));
          return;
        }
        setState("saved");
        router.refresh();
      }}
    >
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => {
            setValue(e.target.checked);
            setState("idle");
          }}
          className="mt-0.5 h-4 w-4 accent-accent"
        />
        <span>
          <span className="block font-medium">{t("Require approval of new sign-ups")}</span>
          <span className="mt-1 block text-xs text-muted">
            {value
              ? t("On: after confirming the e-mail, the client waits for an admin to approve or reject the sign-up.")
              : t("Off: after confirming the e-mail, the client becomes active and goes straight to the dashboard. You still get an e-mail about each new client and can deactivate it.")}
          </span>
        </span>
      </label>
      <p className="hint">
        {t("Changing it does not change anyone's status: clients awaiting approval keep waiting.")}
      </p>
      <button type="submit" disabled={state === "saving"} className="btn btn-primary">
        {state === "saved" ? t("Saved") : t("Save")}
      </button>
      {error && <p role="alert" className="text-[13px] text-error">{error}</p>}
    </form>
  );
}
