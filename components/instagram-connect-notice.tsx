"use client";

/**
 * What happened with the Meta login (the ?instagram= code the callback
 * returns with), in plain words, and how to try again. Meta's raw errors never
 * show here: the detail goes to the admin's Diagnostics.
 */

import Link from "next/link";
import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { PERMISSION_PURPOSE } from "@/lib/meta/permissions";

type Tone = "error" | "warning" | "success";

/** Where "Try again" leads: the screen that explains the login first. */
export const CONNECT_PAGE = "/accounts/connect";

const MESSAGES: Record<string, { tone: Tone; title: StaticMessageKey; detail: StaticMessageKey; retry?: boolean }> = {
  connected: {
    tone: "success",
    title: "Instagram account connected",
    detail:
      "The account is active: its automations start answering right away. You can turn them off here at any time.",
  },
  denied: {
    tone: "warning",
    title: "Instagram connection cancelled",
    detail: "You closed or cancelled the Facebook login, so nothing was connected. You can try again whenever you want.",
    retry: true,
  },
  no_account: {
    tone: "warning",
    title: "No Instagram professional account found",
    detail:
      "The login worked, but no Instagram account came with it. Your Instagram account must be a professional account (Business or Creator) linked to a Facebook Page, and you must select it on the login screen. Then try again.",
    retry: true,
  },
  invalid: {
    tone: "error",
    title: "Instagram connection expired",
    detail: "The login link was missing or older than 10 minutes. Start a fresh attempt.",
    retry: true,
  },
  forbidden: {
    tone: "error",
    title: "Not permitted",
    detail:
      "Only workspace owners and admins can connect an Instagram account.",
  },
  already_connected: {
    tone: "warning",
    title: "Account already connected",
    detail:
      "That Instagram account is connected to another workspace. Disconnect it there first, or connect a different account.",
  },
  failed: {
    tone: "error",
    title: "Instagram connection failed",
    detail:
      "Meta accepted the login, but the connection could not be completed. Try again in a moment. If it keeps happening, contact support.",
    retry: true,
  },
};

export function InstagramConnectNotice() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const status = searchParams.get("instagram");

  if (!status) return null;

  const retry = (
    <Link href={CONNECT_PAGE} className="whitespace-nowrap font-semibold underline underline-offset-4" data-connect-retry>
      {t("Try again")}
    </Link>
  );

  if (status === "limit") {
    const max = Number(searchParams.get("max")) || 1;
    const connected = Number(searchParams.get("connected")) || 0;
    return (
      <Notice tone="warning" title={t("Account limit reached")}>
        <p>
          {t(max === 1 ? "Your plan allows {max} account. Contact support to increase it." : "Your plan allows {max} accounts. Contact support to increase it.", { max })}
        </p>
        {connected > 0 && <p className="mt-1">{t("Connected now: {count}.", { count: connected })}</p>}
      </Notice>
    );
  }

  if (status === "missing_permissions") {
    const missing = (searchParams.get("missing") ?? "").split(",").filter((p): p is keyof typeof PERMISSION_PURPOSE => Object.hasOwn(PERMISSION_PURPOSE, p));
    return (
      <Notice tone="warning" title={t("A permission was not granted")} action={retry}>
        <p>{t("Nothing was connected: the automations need every permission on the login screen. Try again and keep all of them selected.")}</p>
        {missing.length > 0 && (
          <ul className="mt-2 space-y-1.5" data-missing-permissions>
            {missing.map((permission) => (
              <li key={permission}>
                <span className="font-mono text-xs">{permission}</span>: {t(PERMISSION_PURPOSE[permission])}
              </li>
            ))}
          </ul>
        )}
      </Notice>
    );
  }

  if (status === "misconfigured") {
    const missing = (searchParams.get("missing") ?? "")
      .split(",")
      .filter(Boolean);

    return (
      <Notice tone="error" title={t("Instagram app not configured")}>
        <p>
          {t("Set")}{" "}
          {missing.length > 0
            ? t("these environment variables")
            : t("the required environment variables")}{" "}
          {t("and restart the server:")}
        </p>
        {missing.length > 0 && (
          <ul className="mt-2 space-y-1">
            {missing.map((name) => (
              <li key={name} className="font-mono text-xs">
                {name}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2">
          {t("See")} <span className="font-mono text-xs">docs/setup.md</span> {t("for how to obtain each value. Note that")}{" "}
          <span className="font-mono text-xs">ENCRYPTION_KEY</span> {t("must be a 64-character hex string.")}
        </p>
      </Notice>
    );
  }

  const known = MESSAGES[status];
  if (!known) return null;

  return (
    <div className="space-y-3">
      <Notice tone={known.tone} title={t(known.title)} action={known.retry ? retry : undefined}>
        <p>{t(known.detail)}</p>
      </Notice>
      {status === "connected" && searchParams.get("webhooks") === "off" && (
        <Notice tone="warning" title={t("Instagram notifications are not active yet")} action={retry}>
          <p>{t("Meta did not accept the subscription to this account's comments and messages, so the automations cannot answer yet. Connect again; if this message comes back, contact support.")}</p>
        </Notice>
      )}
    </div>
  );
}

function Notice({
  tone,
  title,
  action,
  children,
}: {
  tone: Tone;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Alert tone={tone} title={title} action={action}>
      {children}
    </Alert>
  );
}
