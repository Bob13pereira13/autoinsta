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
import { Alert } from "@/components/ui/alert";
import { Button, ButtonAnchor, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";

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
    <div className="space-y-6">
      {/* ?instagram= codes the login routes redirect back with. useSearchParams
          needs a Suspense boundary in a prerendered client page. */}
      <Suspense fallback={null}>
        <InstagramConnectNotice />
      </Suspense>

      <PageHeader
        title={t("Accounts")}
        description={
          <>
            {!loading && (
              <span className="font-medium text-foreground">
                {accountLimit === null
                  ? t(accounts.length === 1 ? "{count} account connected" : "{count} accounts connected", { count: accounts.length })
                  : t("{count} of {max} accounts", { count: accounts.length, max: accountLimit })}
                .{" "}
              </span>
            )}
            {t("The Instagram accounts your automations answer from. Turn an account off to pause all of its automations at once, without deleting anything.")}
          </>
        }
        actions={
          canManage &&
          !loading &&
          !atLimit && (
            <ButtonAnchor href={CONNECT_URL} variant="primary" icon="plus">
              {t("Connect Instagram account")}
            </ButtonAnchor>
          )
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {canManage && !loading && atLimit && accounts.length > 0 && (
        <Alert tone="info" role={null}>
          {limitText}
        </Alert>
      )}

      {!canManage && !loading && accounts.length > 0 && (
        <p className="hint">{t("Only owners and admins can connect, turn off or remove accounts.")}</p>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="card h-20" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center sm:p-12">
          <span className="grid h-12 w-12 place-items-center rounded-control border border-accent-soft-border bg-accent-soft text-accent-soft-icon">
            <Icon name="accounts" size={22} />
          </span>
          <h2 className="title-section">{t("No Instagram account connected")}</h2>
          <p className="max-w-sm text-sm text-muted">
            {t("Connect an Instagram professional account to start answering comments, stories and direct messages.")}
          </p>
          {canManage && (
            <ButtonAnchor href={CONNECT_URL} variant="primary" icon="plus" className="mt-2">
              {t("Connect Instagram account")}
            </ButtonAnchor>
          )}
        </Card>
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

      <RemoveDialog
        account={removing}
        busy={removing ? busy === `remove:${removing.id}` : false}
        onCancel={() => setRemoving(null)}
        onRemove={() => removing && void remove(removing)}
        onDeactivate={() => {
          if (!removing) return;
          void setEnabled(removing, false);
          setRemoving(null);
        }}
      />
    </div>
  );
}

function Avatar({ accountId, username, on }: { accountId: string; username: string; on: boolean }) {
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
  // A ring in the brand gradient while the account answers; neutral when off.
  return (
    <span aria-hidden="true" className={cx("h-12 w-12 shrink-0 rounded-full p-[2px]", on ? "bg-gradient-accent" : "bg-switch-off")}>
      {url && !failed ? (
        <img src={url} alt="" onError={() => setFailed(true)} className="h-full w-full rounded-full border-2 border-[color:var(--bg)] object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center rounded-full border-2 border-[color:var(--bg)] bg-accent-soft text-[15px] font-bold uppercase text-accent-soft-fg">
          {username.slice(0, 2)}
        </span>
      )}
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
  const expired = Boolean(account.tokenInvalidAt);
  return (
    <li
      className={cx(
        "card card-interactive flex flex-wrap items-center gap-x-5 gap-y-3.5 px-[18px] py-4 hover:!translate-y-0",
        expired && "!border-warning-border"
      )}
    >
      <div className="flex min-w-0 flex-[1_1_300px] items-center gap-3.5">
        <Avatar accountId={account.id} username={account.username} on={on} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-display text-base font-semibold text-heading">@{account.username}</p>
          <p className="text-[13px] text-muted">
            {account.name ? `${account.name} · ` : ""}
            {on
              ? t(account.automationCount === 1 ? "Active · {count} automation" : "Active · {count} automations", { count: account.automationCount })
              : t("Turned off · no automation of this account is answering")}
          </p>
        </div>
      </div>
      {expired && (
        <div className="order-last flex flex-[1_1_100%] flex-wrap items-center gap-2.5 border-t border-border-subtle pt-3">
          <span className="flex min-w-0 flex-1 items-start gap-1.5 text-[13px] text-warning">
            <Icon name="alert" size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
            {t("Instagram access expired or was revoked. Nothing is being answered from this account until you reconnect it.")}
          </span>
          {canManage && (
            <a
              href={CONNECT_URL}
              className="btn btn-sm shrink-0 border border-warning-border bg-warning-soft text-warning hover:border-warning-dot"
            >
              {t("Reconnect")}
            </a>
          )}
        </div>
      )}
      <div className="ml-auto flex flex-none items-center gap-1.5">
        <span className={cx("min-w-[88px] text-right text-[13px] font-medium", on ? "text-success" : "text-faint")}>{on ? t("Active") : t("Turned off")}</span>
        <Switch
          checked={on}
          onChange={(next) => onToggle(next)}
          label={t("Automations of @{username}", { username: account.username })}
          disabled={!canManage || busy === `toggle:${account.id}`}
        />
        {canManage && (
          <button type="button" onClick={onRemove} aria-label={t("Remove @{username}", { username: account.username })} className={buttonClass("danger-ghost", "icon")}>
            <Icon name="trash" size={18} strokeWidth={1.9} />
          </button>
        )}
      </div>
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
  account: Account | null;
  busy: boolean;
  onCancel: () => void;
  onRemove: () => void;
  onDeactivate: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      open={account !== null}
      onClose={onCancel}
      tone="danger"
      title={account ? t("Remove @{username}?", { username: account.username }) : ""}
      description={
        account &&
        t(
          account.automationCount === 1
            ? "This permanently deletes this account's {count} automation, its send history and its tracked links. It cannot be undone."
            : "This permanently deletes this account's {count} automations, their send history and their tracked links. It cannot be undone.",
          { count: account.automationCount }
        )
      }
      footer={
        <>
          <Button onClick={onCancel}>{t("Cancel")}</Button>
          {account?.automationsEnabled && (
            <Button variant="soft" onClick={onDeactivate}>
              {t("Turn off instead")}
            </Button>
          )}
          <Button variant="danger" onClick={onRemove} disabled={busy}>
            {busy ? t("Removing…") : t("Remove for good")}
          </Button>
        </>
      }
    >
      {account?.automationsEnabled && (
        <p className="text-sm leading-relaxed text-muted">
          {t("Just want it to stop answering? Turn the account off instead: nothing is deleted and you can turn it back on whenever you want.")}
        </p>
      )}
    </Dialog>
  );
}
