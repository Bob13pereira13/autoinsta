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
      className="card max-w-md space-y-3 p-5"
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
        <span className="label">{t("Price per Instagram account (R$ per month)")}</span>
        <input inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setState("idle"); }} className="field !w-40" />
      </label>
      <p className="hint">{t("Only used for the estimated revenue. Nobody is charged.")}</p>
      <button type="submit" disabled={state === "saving"} className="btn btn-primary">
        {state === "saved" ? t("Saved") : t("Save")}
      </button>
      {error && <p role="alert" className="text-[13px] text-error">{error}</p>}
    </form>
  );
}
