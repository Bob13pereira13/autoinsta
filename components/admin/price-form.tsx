"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

export default function PriceForm({ cents }: { cents: number }) {
  const { t, message } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState((cents / 100).toFixed(2).replace(".", ","));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="panel max-w-md space-y-3 rounded p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const parsed = Number(value.replace(/\./g, "").replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < 0) return setError(t("Enter a valid price"));
        setState("saving");
        const res = await fetch("/api/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pricePerAccountCents: Math.round(parsed * 100) }),
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
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("Price per Instagram account (R$ per month)")}</span>
        <input inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setState("idle"); }} className="w-40 rounded border border-border bg-surface px-3 py-2 text-sm" />
      </label>
      <p className="text-xs text-muted">{t("Only used for the estimated revenue. Nobody is charged.")}</p>
      <button type="submit" disabled={state === "saving"} className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">
        {state === "saved" ? t("Saved") : t("Save")}
      </button>
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
    </form>
  );
}
