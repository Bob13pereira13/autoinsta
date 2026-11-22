"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusDot } from "@/components/ui/status";

type Key = { id: string; name: string; expiresAt: string; revokedAt: string | null };

export default function IntegrationsPage() {
  const { t, locale, message } = useI18n();
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/integrations/keys");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setKeys(data.keys);
  }

  useEffect(() => { void Promise.resolve().then(load).catch(e => setNotice(e.message)); }, []);

  async function create() {
    if (!window.confirm(t("Create a read-only workspace key for {days} days? Anyone with this key can read your campaigns.", { days }))) return;
    setBusy(true); setToken(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, days, scopes: ["campaigns:read"] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setToken(data.token);
      await load();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  async function revoke(key: Key) {
    if (!window.confirm(t("Revoke this key? Connected clients will lose access immediately."))) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(`/api/integrations/keys?id=${encodeURIComponent(key.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error);
      setToken("");
      await load();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        title={t("API & MCP")}
        description={t("Workspace-scoped, read-only keys. No key can modify campaigns or send messages. Only admins and owners can manage keys.")}
      />
      {notice && (
        <Alert tone="info" role="status">
          {message(notice)}
        </Alert>
      )}
      <section className="card space-y-4 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <label className="block space-y-1.5">
            <span className="label">{t("Key name")}</span>
            <input maxLength={100} disabled={busy} className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="label">{t("Key lifetime")}</span>
            <select disabled={busy} value={days} onChange={(e) => setDays(Number(e.target.value))} className="field">
              {[30, 60, 90].map((value) => (
                <option key={value} value={value}>
                  {t("{days} days", { days: value })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">{t("Applies only to new keys. Existing expiration dates do not change.")}</p>
        <Button variant="primary" icon="key" disabled={busy || !name.trim()} onClick={create}>
          {t("Create key for {days} days", { days })}
        </Button>
        {token && (
          <div role="status" className="space-y-2.5 rounded-control border border-warning-border bg-warning-soft p-4">
            <p className="text-sm text-warning">{t("Shown once. Store securely; never put keys in URLs, screenshots or GitHub.")}</p>
            <input aria-label={t("New service key")} type="password" readOnly value={token} className="field font-mono" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="copy" onClick={() => navigator.clipboard.writeText(token).catch(() => setNotice(t("Could not copy key. Use a secure HTTPS connection.")))}>
                {t("Copy")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setToken("")}>
                {t("Hide key")}
              </Button>
            </div>
          </div>
        )}
      </section>
      {keys.length > 0 && (
        <ul className="space-y-3">
          {keys.map((key) => (
            <li key={key.id} className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-heading">{key.name}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                  <span className="chip">campaigns:read</span>
                  {t("Expires: {date}", { date: new Date(key.expiresAt).toLocaleDateString(locale) })}
                </p>
              </div>
              {key.revokedAt ? (
                <StatusDot tone="neutral">{t("Revoked")}</StatusDot>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => revoke(key)} className="!border-error-border !text-error hover:!bg-error-soft">
                  {t("Revoke key")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <section className="card space-y-2.5 p-5 text-sm leading-relaxed sm:p-6">
        <h2 className="title-section">{t("Connection")}</h2>
        <p>
          MCP: <code className="code">/api/mcp</code> · REST: <code className="code">/api/v1/campaigns</code>
        </p>
        <p className="text-muted">{t("Streamable HTTP with an Authorization: Bearer header. This server does not provide OAuth; use a client that supports custom headers.")}</p>
        <p className="text-muted">{t("Campaign lists are limited to 100. Use get_campaign for complete settings and destination links; clicks are raw requests, not unique recipients.")}</p>
      </section>
    </div>
  );
}
