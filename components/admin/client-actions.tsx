"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { buttonClass } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

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

  const size = compact ? "sm" : "md";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(status === "PENDING_APPROVAL" || status === "REJECTED") && (
          <button type="button" disabled={busy} onClick={() => void run("approve")} className={buttonClass("primary", size)}>
            {t("Approve")}
          </button>
        )}
        {status === "PENDING_APPROVAL" && (
          <button type="button" disabled={busy} onClick={() => setRejecting((v) => !v)} className={buttonClass("secondary", size, "!border-error-border !text-error hover:!bg-error-soft")}>
            {t("Reject")}
          </button>
        )}
        {status === "DISABLED" && (
          <button type="button" disabled={busy} onClick={() => void run("activate")} className={buttonClass("primary", size)}>
            {t("Activate")}
          </button>
        )}
        {status === "ACTIVE" && !compact && (
          <button type="button" disabled={busy} onClick={() => void run("deactivate")} className={buttonClass("secondary", size)}>
            {t("Deactivate")}
          </button>
        )}
      </div>
      {rejecting && (
        <form
          className="space-y-2.5 rounded-control border border-error-border bg-error-soft p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run("reject", { reason });
          }}
        >
          <label htmlFor={`reason-${clientId}`} className="block text-[13px] font-semibold text-heading">
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
            className="field"
          />
          <button type="submit" disabled={busy || reason.trim().length < 3} className={buttonClass("danger", size)}>
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
      <p className="text-xs font-semibold uppercase tracking-wide text-faint">{t("Instagram account limit")}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="radio" name={name} checked={mode === "default"} onChange={() => { setMode("default"); setState("idle"); }} className="h-4 w-4 accent-accent" />
        {t("Follow the default ({limit})", { limit: limitLabel(platformDefault) })}
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <input type="radio" name={name} checked={mode === "own"} onChange={() => { setMode("own"); setState("idle"); }} className="h-4 w-4 accent-accent" />
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
          className="field !min-h-9 !w-24 !px-2 !py-1"
        />
      </label>
      <p className="text-sm">
        <span className="text-muted">{t("Limit in effect:")}</span> <strong>{limitLabel(effective)}</strong>
      </p>
      <button type="submit" disabled={state === "saving" || unchanged} className="btn btn-secondary">
        {state === "saved" ? t("Saved") : t("Save")}
      </button>
      <p className="hint">
        {t("{count} connected now. Lowering the limit disconnects nothing; it only blocks new connections.", { count: connected })}
      </p>
      {error && <p role="alert" className="text-[13px] text-error">{error}</p>}
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
      <textarea id="admin-notes" rows={4} maxLength={5000} value={value} onChange={(e) => { setValue(e.target.value); setState("idle"); }} className="field" placeholder={t("Only admins see these notes.")} />
      <button type="submit" disabled={state === "saving" || value === (notes ?? "")} className="btn btn-secondary">
        {state === "saved" ? t("Saved") : t("Save notes")}
      </button>
      {error && <p role="alert" className="text-[13px] text-error">{error}</p>}
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
      <span className={`text-[13px] font-medium ${enabled ? "text-success" : "text-faint"}`}>{enabled ? t("Active") : t("Turned off")}</span>
      <Switch
        checked={enabled}
        onChange={() => void act("PATCH", { automationsEnabled: !enabled })}
        label={t("Automations of @{username}", { username })}
        disabled={busy}
      />
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
        className={buttonClass("secondary", "sm", "!border-error-border !text-error hover:!bg-error-soft")}
      >
        {t("Remove")}
      </button>
      {error && <p role="alert" className="w-full text-xs text-error">{error}</p>}
    </div>
  );
}
