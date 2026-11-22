"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

/** "Default account limit per client": No limit (null) or a number. */
export default function DefaultLimitForm({ limit }: { limit: number | null }) {
  const { t, message } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "number">(limit === null ? "none" : "number");
  const [value, setValue] = useState(limit === null ? "" : String(limit));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="panel max-w-md space-y-3 rounded p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setState("saving");
        const res = await fetch("/api/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultInstagramAccountLimit: mode === "none" ? null : Number(value) }),
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
      <p className="text-sm font-medium">{t("Default account limit per client")}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name="default-limit" checked={mode === "none"} onChange={() => { setMode("none"); setState("idle"); }} />
        {t("No limit")}
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <input type="radio" name="default-limit" checked={mode === "number"} onChange={() => { setMode("number"); setState("idle"); }} />
        {t("Up to")}
        <input
          type="number"
          min={1}
          max={100}
          aria-label={t("Default account limit per client")}
          disabled={mode !== "number"}
          required={mode === "number"}
          value={value}
          onChange={(e) => { setValue(e.target.value); setState("idle"); }}
          className="w-24 rounded border border-border bg-surface px-2 py-1 text-sm disabled:opacity-50"
        />
        {t("accounts")}
      </label>
      <p className="text-xs text-muted">
        {t("Applies to every client that follows the default; a client with its own limit keeps it. Lowering it disconnects nothing.")}
      </p>
      <button type="submit" disabled={state === "saving"} className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">
        {state === "saved" ? t("Saved") : t("Save")}
      </button>
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
    </form>
  );
}
