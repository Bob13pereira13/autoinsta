"use client";

/**
 * Accounts tab: connect Instagram accounts, turn each account's automations
 * off and on (nothing is deleted), reconnect an account whose access expired,
 * and remove an account for good. Changing anything is for owners and admins;
 * members only see the list.
 */

/* eslint-disable @next/next/no-img-element */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { InstagramConnectNotice } from "@/components/instagram-connect-notice";

interface Account {
  id: string;
  username: string;
  name: string | null;
  automationsEnabled: boolean;
  tokenInvalidAt: string | null;
  connectedAt: string;
  automationCount: number;
}

const CONNECT_URL = "/api/instagram/connect";

export default function AccountsPage() {
  const { t, message } = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [canManage, setCanManage] = useState(false);
  // null = no limit (the client follows a "no limit" default).
  const [accountLimit, setAccountLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Account | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/instagram/accounts", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data.instagramAccounts);
        setCanManage(Boolean(data.data.canManage));
        setAccountLimit(typeof data.data.accountLimit === "number" ? data.data.accountLimit : null);
      } else {
        setError(message(data.error, "Could not load accounts"));
      }
    } catch {
      setError(t("Could not load accounts"));
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function setEnabled(account: Account, automationsEnabled: boolean) {
    setError(null);
    setBusy(`toggle:${account.id}`);
    // Optimistic: the switch moves at once and goes back if the save fails.
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, automationsEnabled } : a)));
    try {
      const res = await fetch(`/api/instagram/accounts?id=${encodeURIComponent(account.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationsEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) throw new Error(data.error);
    } catch (err) {
      setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, automationsEnabled: !automationsEnabled } : a)));
      setError(message((err as Error).message, "Could not save. Try again."));
    } finally {
      setBusy(null);
    }
  }

  async function remove(account: Account) {
    setError(null);
    setBusy(`remove:${account.id}`);
    try {
      const res = await fetch(`/api/instagram/accounts?id=${encodeURIComponent(account.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!data.success) throw new Error(data.error);
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      setRemoving(null);
    } catch (err) {
      setError(message((err as Error).message, "Could not remove the account. Try again."));
    } finally {
      setBusy(null);
    }
  }

  const atLimit = accountLimit !== null && accounts.length >= accountLimit;
  const limitText = accountLimit === null
    ? ""
    : t(
        accountLimit === 1 ? "Your plan allows {max} account. Contact support to increase it." : "Your plan allows {max} accounts. Contact support to increase it.",
        { max: accountLimit }
      );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ?instagram= codes the login routes redirect back with. useSearchParams
          needs a Suspense boundary in a prerendered client page. */}
      <Suspense fallback={null}>
        <InstagramConnectNotice />
      </Suspense>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-sm text-foreground">
            {t("The Instagram accounts your automations answer from. Turn an account off to pause all of its automations at once, without deleting anything.")}
          </p>
          {!loading && (
            <p className="mt-1 text-xs text-muted">
              {accountLimit === null
                ? t(accounts.length === 1 ? "{count} account connected" : "{count} accounts connected", { count: accounts.length })
                : t("{count} of {max} accounts", { count: accounts.length, max: accountLimit })}
            </p>
          )}
        </div>
        {canManage && !loading && !atLimit && (
          <a
            href={CONNECT_URL}
            className="shrink-0 rounded bg-accent px-4 py-2 text-center text-sm font-medium text-white hover:bg-accent-hover"
          >
            {t("Connect Instagram account")}
          </a>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded border border-error/20 bg-error/10 p-3 text-sm text-error">
          {error}
        </p>
      )}

      {canManage && !loading && atLimit && accounts.length > 0 && (
        <p className="rounded border border-border bg-surface px-3 py-2 text-sm text-muted">{limitText}</p>
      )}

      {!canManage && !loading && accounts.length > 0 && (
        <p className="text-xs text-muted">{t("Only owners and admins can connect, turn off or remove accounts.")}</p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="panel h-20 rounded" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="panel rounded p-8 text-center sm:p-12">
          <h3 className="mb-2 text-lg font-semibold">{t("No Instagram account connected")}</h3>
          <p className="mx-auto mb-6 max-w-sm text-sm text-muted">
            {t("Connect an Instagram professional account to start answering comments, stories and direct messages.")}
          </p>
          {canManage && (
            <a
              href={CONNECT_URL}
              className="inline-flex rounded bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              {t("Connect Instagram account")}
            </a>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              canManage={canManage}
              busy={busy}
              onToggle={(on) => void setEnabled(account, on)}
              onRemove={() => setRemoving(account)}
            />
          ))}
        </ul>
      )}

      {removing && (
        <RemoveDialog
          account={removing}
          busy={busy === `remove:${removing.id}`}
          onCancel={() => setRemoving(null)}
          onRemove={() => void remove(removing)}
          onDeactivate={() => {
            void setEnabled(removing, false);
            setRemoving(null);
          }}
        />
      )}
    </div>
  );
}

function Avatar({ accountId, username }: { accountId: string; username: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/instagram/profile?instagramAccountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setUrl(d.data.profilePictureUrl ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accountId]);
  if (url && !failed) {
    return <img src={url} alt="" onError={() => setFailed(true)} className="h-11 w-11 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-semibold uppercase text-accent">
      {username.slice(0, 1)}
    </span>
  );
}

function AccountRow({
  account,
  canManage,
  busy,
  onToggle,
  onRemove,
}: {
  account: Account;
  canManage: boolean;
  busy: string | null;
  onToggle: (on: boolean) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const on = account.automationsEnabled;
  return (
    <li className="panel rounded p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Avatar accountId={account.id} username={account.username} />
        <div className="min-w-[10rem] flex-1">
          <p className="truncate text-sm font-semibold text-foreground">@{account.username}</p>
          <p className="mt-0.5 text-xs text-muted">
            {on
              ? t(account.automationCount === 1 ? "Active · {count} automation" : "Active · {count} automations", { count: account.automationCount })
              : t("Turned off · no automation of this account is answering")}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className={`text-xs font-medium ${on ? "text-success" : "text-muted"}`}>{on ? t("Active") : t("Turned off")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={t("Automations of @{username}", { username: account.username })}
            disabled={!canManage || busy === `toggle:${account.id}`}
            onClick={() => onToggle(!on)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-accent" : "bg-zinc-300"}`}
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${on ? "left-6" : "left-1"}`} />
          </button>
          {canManage && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={t("Remove @{username}", { username: account.username })}
              className="grid h-9 w-9 place-items-center rounded border border-border text-muted hover:border-error/40 hover:bg-error/10 hover:text-error"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {account.tokenInvalidAt && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-error/20 bg-error/10 px-3 py-2">
          <p className="text-xs font-medium text-error">
            {t("Instagram access expired or was revoked. Nothing is being answered from this account until you reconnect it.")}
          </p>
          {canManage && (
            <a href={CONNECT_URL} className="shrink-0 rounded bg-error px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              {t("Reconnect")}
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function RemoveDialog({
  account,
  busy,
  onCancel,
  onRemove,
  onDeactivate,
}: {
  account: Account;
  busy: boolean;
  onCancel: () => void;
  onRemove: () => void;
  onDeactivate: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-title"
        aria-describedby="remove-body"
        className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="remove-title" className="text-base font-semibold text-foreground">
          {t("Remove @{username}?", { username: account.username })}
        </h2>
        <div id="remove-body" className="mt-3 space-y-3 text-sm text-muted">
          <p>
            {t(
              account.automationCount === 1
                ? "This permanently deletes this account's {count} automation, its send history and its tracked links. It cannot be undone."
                : "This permanently deletes this account's {count} automations, their send history and their tracked links. It cannot be undone.",
              { count: account.automationCount }
            )}
          </p>
          {account.automationsEnabled && (
            <p className="rounded border border-warning/30 bg-warning/10 p-2 text-warning">
              {t("Just want it to stop answering? Turn the account off instead: nothing is deleted and you can turn it back on whenever you want.")}
            </p>
          )}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded border border-border px-4 py-2 text-sm text-muted hover:text-foreground">
            {t("Cancel")}
          </button>
          {account.automationsEnabled && (
            <button type="button" onClick={onDeactivate} className="rounded border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10">
              {t("Turn off instead")}
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="rounded bg-error px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? t("Removing…") : t("Remove for good")}
          </button>
        </div>
      </div>
    </div>
  );
}
