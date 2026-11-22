"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

async function post(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) throw new Error(data.error ?? "Error");
  return data.data;
}

/** Approve / Reject (with reason) / Activate / Deactivate, depending on the status. */
export function ClientStatusActions({ clientId, status, compact = false }: { clientId: string; status: string; compact?: boolean }) {
  const { t, message } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function run(action: string, extra: Record<string, unknown> = {}) {
    if (action === "deactivate" && !window.confirm(t("Turn off this client? None of its automations will answer until it is turned on again. Nothing is deleted."))) return;
    setBusy(true);
    setError(null);
    try {
      await post(`/api/admin/clients/${clientId}/status`, "POST", { action, ...extra });
      setRejecting(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(message((err as Error).message, "Could not save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const button = "rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(status === "PENDING_APPROVAL" || status === "REJECTED") && (
          <button type="button" disabled={busy} onClick={() => void run("approve")} className={`${button} bg-success text-white hover:opacity-90`}>
            {t("Approve")}
          </button>
        )}
        {status === "PENDING_APPROVAL" && (
          <button type="button" disabled={busy} onClick={() => setRejecting((v) => !v)} className={`${button} border border-error/40 text-error hover:bg-error/10`}>
            {t("Reject")}
          </button>
        )}
        {status === "DISABLED" && (
          <button type="button" disabled={busy} onClick={() => void run("activate")} className={`${button} bg-success text-white hover:opacity-90`}>
            {t("Activate")}
          </button>
        )}
        {status === "ACTIVE" && !compact && (
          <button type="button" disabled={busy} onClick={() => void run("deactivate")} className={`${button} border border-border text-muted hover:text-foreground`}>
            {t("Deactivate")}
          </button>
        )}
      </div>
      {rejecting && (
        <form
          className="space-y-2 rounded border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("reject", { reason });
          }}
        >
          <label htmlFor={`reason-${clientId}`} className="block text-xs font-medium text-foreground">
            {t("Reason (sent to the client by e-mail)")}
          </label>
          <textarea
            id={`reason-${clientId}`}
            required
            minLength={3}
            maxLength={1000}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy || reason.trim().length < 3} className={`${button} bg-error text-white hover:opacity-90`}>
            {t("Reject and send e-mail")}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** "Follow the default" (null) or the client's own number; shows the limit in effect. */
export function LimitEditor({
  clientId,
  own,
  platformDefault,
  connected,
}: {
  clientId: string;
  own: number | null;
  platformDefault: number | null;
  connected: number;
}) {
  const { t, message } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<"default" | "own">(own === null ? "default" : "own");
  const [value, setValue] = useState(own === null ? "" : String(own));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const limitLabel = (n: number | null) =>
    n === null ? t("No limit") : t(n === 1 ? "{count} account" : "{count} accounts", { count: n });
  const next = mode === "default" ? null : Number(value);
  const effective = mode === "default" ? platformDefault : Number.isInteger(next) && (next ?? 0) > 0 ? next : own;
  const unchanged = mode === "default" ? own === null : next === own;
  const name = `limit-${clientId}`;
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        setError(null);
        try {
          await post(`/api/admin/clients/${clientId}`, "PATCH", { instagramAccountLimit: next });
          setState("saved");
          router.refresh();
        } catch (err) {
          setState("idle");
          setError(message((err as Error).message, "Could not save. Try again."));
        }
      }}
    >
      <p className="text-xs text-muted">{t("Instagram account limit")}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name={name} checked={mode === "default"} onChange={() => { setMode("default"); setState("idle"); }} />
        {t("Follow the default ({limit})", { limit: limitLabel(platformDefault) })}
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <input type="radio" name={name} checked={mode === "own"} onChange={() => { setMode("own"); setState("idle"); }} />
        {t("Own limit")}
        <input
          type="number"
          min={1}
          max={100}
          aria-label={t("Own limit")}
          disabled={mode !== "own"}
          required={mode === "own"}
          value={value}
          onChange={(e) => { setValue(e.target.value); setState("idle"); }}
          className="w-24 rounded border border-border bg-surface px-2 py-1 text-sm disabled:opacity-50"
        />
      </label>
      <p className="text-sm">
        <span className="text-muted">{t("Limit in effect:")}</span> <strong>{limitLabel(effective)}</strong>
      </p>
      <button type="submit" disabled={state === "saving" || unchanged} className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-50">
        {state === "saved" ? t("Saved") : t("Save")}
      </button>
      <p className="text-xs text-muted">
        {t("{count} connected now. Lowering the limit disconnects nothing; it only blocks new connections.", { count: connected })}
      </p>
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
    </form>
  );
}

export function NotesEditor({ clientId, notes }: { clientId: string; notes: string | null }) {
  const { t, message } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState(notes ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        setError(null);
        try {
          await post(`/api/admin/clients/${clientId}`, "PATCH", { internalNotes: value });
          setState("saved");
          router.refresh();
        } catch (err) {
          setState("idle");
          setError(message((err as Error).message, "Could not save. Try again."));
        }
      }}
    >
      <label htmlFor="admin-notes" className="sr-only">{t("Internal notes")}</label>
      <textarea id="admin-notes" rows={4} maxLength={5000} value={value} onChange={(e) => { setValue(e.target.value); setState("idle"); }} className="w-full rounded border border-border bg-surface px-3 py-2 text-sm" placeholder={t("Only admins see these notes.")} />
      <button type="submit" disabled={state === "saving" || value === (notes ?? "")} className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-50">
        {state === "saved" ? t("Saved") : t("Save notes")}
      </button>
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
    </form>
  );
}

export function AdminAccountControls({
  clientId,
  accountId,
  username,
  enabled,
  automations,
}: {
  clientId: string;
  accountId: string;
  username: string;
  enabled: boolean;
  automations: number;
}) {
  const { t, message } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/admin/clients/${clientId}/accounts/${accountId}`;
  async function act(method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await post(url, method, body);
      router.refresh();
    } catch (err) {
      setError(message((err as Error).message, "Could not save. Try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={`text-xs font-medium ${enabled ? "text-success" : "text-muted"}`}>{enabled ? t("Active") : t("Turned off")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t("Automations of @{username}", { username })}
        disabled={busy}
        onClick={() => void act("PATCH", { automationsEnabled: !enabled })}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-accent" : "bg-zinc-300"}`}
      >
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? "left-6" : "left-1"}`} />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const text = t(
            automations === 1
              ? "Remove @{username} for good? This deletes its {count} automation, send history and tracked links."
              : "Remove @{username} for good? This deletes its {count} automations, send history and tracked links.",
            { username, count: automations }
          );
          if (window.confirm(text)) void act("DELETE");
        }}
        className="rounded border border-error/30 px-2.5 py-1 text-xs text-error hover:bg-error/10 disabled:opacity-50"
      >
        {t("Remove")}
      </button>
      {error && <p role="alert" className="w-full text-xs text-error">{error}</p>}
    </div>
  );
}
