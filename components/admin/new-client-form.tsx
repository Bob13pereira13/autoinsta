"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

export default function NewClientForm() {
  const { t, message } = useI18n();
  const router = useRouter();
  // Empty limit = follow the platform default.
  const [values, setValues] = useState({ name: "", email: "", companyName: "", phone: "", document: "", instagramAccountLimit: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const input = "field";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, instagramAccountLimit: values.instagramAccountLimit.trim() ? Number(values.instagramAccountLimit) : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) {
        setError(message(data.error, "Could not save. Try again."));
        return;
      }
      router.push(`/admin/clients/${data.data.workspaceId}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card max-w-lg space-y-4 p-5">
      {error && <p role="alert" className="rounded-control border border-error-border bg-error-soft px-4 py-3 text-sm text-error">{error}</p>}
      {(
        [
          ["name", t("Your name"), "text", true],
          ["email", t("E-mail"), "email", true],
          ["companyName", t("Company name"), "text", true],
          ["phone", t("Phone (WhatsApp)"), "tel", false],
          ["document", t("CPF or CNPJ"), "text", false],
        ] as const
      ).map(([field, label, type, required]) => (
        <label key={field} className="block space-y-1 text-sm">
          <span className="label">
            {label} {!required && <span className="font-normal text-muted">{t("(optional)")}</span>}
          </span>
          <input type={type} required={required} value={values[field]} onChange={set(field)} className={input} />
        </label>
      ))}
      <label className="block space-y-1 text-sm">
        <span className="label">
          {t("Instagram account limit")} <span className="font-normal text-muted">{t("(optional)")}</span>
        </span>
        <input type="number" min={1} max={100} value={values.instagramAccountLimit} onChange={set("instagramAccountLimit")} className="field !w-28" />
        <span className="hint block">{t("Empty = follow the default limit (set in Settings).")}</span>
      </label>
      <p className="text-xs text-faint">{t("The client starts Active and gets an e-mail to set the password (link valid for 7 days).")}</p>
      <button type="submit" disabled={saving} className="btn btn-primary">
        {saving ? t("Saving…") : t("Create client and send invitation")}
      </button>
    </form>
  );
}
