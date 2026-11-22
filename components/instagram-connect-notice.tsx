"use client";

import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/alert";

type Tone = "error" | "warning" | "success";

const MESSAGES: Record<string, { tone: Tone; title: StaticMessageKey; detail: StaticMessageKey }> = {
  connected: {
    tone: "success",
    title: "Instagram account connected",
    detail:
      "The account is active: its automations start answering right away. You can turn them off here at any time.",
  },
  denied: {
    tone: "warning",
    title: "Instagram connection cancelled",
    detail:
      "You declined the permission prompt on Instagram. Start again and accept all requested permissions.",
  },
  invalid: {
    tone: "error",
    title: "Instagram connection expired",
    detail:
      "The login link was missing or older than 10 minutes. Click Connect Instagram to start a fresh attempt.",
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
};

export function InstagramConnectNotice() {
  const { t, message } = useI18n();
  const searchParams = useSearchParams();
  const status = searchParams.get("instagram");

  if (!status) return null;

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

  if (status === "failed") {
    const reason = searchParams.get("reason");

    return (
      <Notice tone="error" title={t("Instagram connection failed")}>
        <p>
          {t("Instagram accepted the login but the connection could not be completed. This is usually a mismatched redirect URI or an app that is missing the required permissions.")}
        </p>
        {reason && (
          <p className="mt-2 break-words font-mono text-xs">
            {message(reason)}
          </p>
        )}
      </Notice>
    );
  }

  const known = MESSAGES[status];
  if (!known) return null;

  return (
    <Notice tone={known.tone} title={t(known.title)}>
      <p>{t(known.detail)}</p>
    </Notice>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Alert tone={tone} title={title}>
      {children}
    </Alert>
  );
}
