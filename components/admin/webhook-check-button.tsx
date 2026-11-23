"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

type Check = {
  ok: boolean;
  subscribed: boolean | null;
  confirmedFields: string[] | null;
  missing: string[];
  subscribeError: string | null;
  checkError: string | null;
};

/**
 * "Check notifications" for one account: subscribes it again and shows what
 * Meta confirms (or Meta's error). Comments arriving and messages not, with
 * every field confirmed here, rules out the subscription: the cause is in the
 * App Dashboard (see GUIA_META_APP_REVIEW.md).
 */
export default function WebhookCheckButton({ clientId, accountId }: { clientId: string; accountId: string }) {
  const { t, message } = useI18n();
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="w-full space-y-1.5" data-webhook-check>
      <button
        type="button"
        disabled={busy}
        className="btn btn-ghost btn-sm"
        onClick={async () => {
          setBusy(true);
          setError(null);
          setCheck(null);
          const res = await fetch(`/api/admin/clients/${clientId}/accounts/${accountId}/webhooks`, { method: "POST" }).catch(() => null);
          const data = res ? await res.json().catch(() => ({})) : {};
          setBusy(false);
          if (!data.success) return setError(message(data.error, "Could not check. Try again."));
          setCheck(data.data as Check);
        }}
      >
        {busy ? t("Checking…") : t("Check notifications")}
      </button>
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
      {check && (
        <p
          className={`break-words text-xs ${check.ok ? "text-success" : check.subscribeError || check.checkError ? "text-error" : "text-warning"}`}
          data-webhook-check-result={check.ok ? "ok" : "problem"}
        >
          {check.subscribeError
            ? t("Subscription refused by Meta: {error}", { error: check.subscribeError })
            : check.checkError
              ? t("Subscribed, but Meta's confirmation could not be read: {error}", { error: check.checkError })
              : check.missing.length
                ? t("Meta confirms {fields}; missing: {missing}.", { fields: check.confirmedFields?.join(", ") || "—", missing: check.missing.join(", ") })
                : t("Meta confirms {fields}.", { fields: check.confirmedFields?.join(", ") ?? "—" })}
        </p>
      )}
    </div>
  );
}
