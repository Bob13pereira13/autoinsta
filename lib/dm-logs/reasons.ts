/**
 * Why a DM log was not sent: every reason the worker writes to
 * DmLog.errorMessage, in one place, and how each one is shown.
 *
 * The worker stores the English text below, as it always has, so rows written
 * long ago and rows written today read the same (and the delivery checks that
 * look at the text keep working). The screen never shows the stored text: it
 * goes through logReasonText(), which turns any reason, old or new, into a
 * catalog message (Portuguese for Portuguese workspaces):
 *  - the texts below, current and earlier versions;
 *  - Instagram (Meta) errors, by their code and subcode;
 *  - anything else (a network error, an unexpected one) as a generic message.
 * Raw text from Meta or from the code never reaches the client.
 */
import type { I18n, MessageKey } from "@/lib/i18n";

/** What the worker writes. Change a text only together with its reading below. */
export const LOG_REASONS = {
  noToken: "No Instagram access token available",
  tokenUnreadable: "Failed to decrypt Instagram access token",
  monthlyLimit: (limit: number) => `Monthly DM limit reached (${limit})`,
  hourlyLimit: "Hourly Instagram DM rate limit reached",
  hourlyLimitRetry: "Hourly rate limit hit; retry scheduled",
  privateReplyUsed: (automationName: string | null | undefined) =>
    `Another campaign (${automationName ?? "unknown"}) already sent the one private reply Instagram allows for this comment`,
  teamAnsweredDuringWait: "Not sent: someone from the account answered this person in the Direct during the wait",
  teamAnsweredReplyWaiting: "Not sent: someone from the account answered this person while the reply was waiting",
  teamTalkedRecently: "Not sent: someone from the account talked to this person in the last 24 hours",
  cooldown: "Not sent: this automation already answered this person within its reply interval",
  commentDeleted: "Not sent: the comment was deleted during the wait",
  commentHidden: "Not sent: the comment was hidden during the wait",
  mediaHourlyLimit: "Media not sent: the account's hourly send limit was reached",
  mediaPartial: (failed: number, total: number, firstError: string) =>
    `Media not fully sent (${failed}/${total} failed): ${firstError}`,
} as const;

/** Texts earlier versions wrote, read the same way as today's. */
const LEGACY: Record<string, MessageKey> = {
  "Not sent: someone from the account answered this person while the DM was waiting":
    "Not sent: someone from the account answered this person in the Direct during the wait",
};

export type LogReason = { key: MessageKey; values?: Record<string, string | number> };

const FIXED: Record<string, MessageKey> = {
  [LOG_REASONS.noToken]: "The Instagram account has no access. Reconnect it in Accounts.",
  [LOG_REASONS.tokenUnreadable]: "The Instagram account's access could not be read. Reconnect it in Accounts.",
  [LOG_REASONS.hourlyLimit]: "Not sent: the account reached Instagram's hourly send limit",
  [LOG_REASONS.hourlyLimitRetry]: "Hourly send limit reached; it will be tried again automatically",
  [LOG_REASONS.teamAnsweredDuringWait]: "Not sent: someone from the account answered this person in the Direct during the wait",
  [LOG_REASONS.teamAnsweredReplyWaiting]: "Not sent: someone from the account answered this person while the reply was waiting",
  [LOG_REASONS.teamTalkedRecently]: "Not sent: someone from the account talked to this person in the last 24 hours",
  [LOG_REASONS.cooldown]: "Not sent: this automation already answered this person within its reply interval",
  [LOG_REASONS.commentDeleted]: "Not sent: the comment was deleted during the wait",
  [LOG_REASONS.commentHidden]: "Not sent: the comment was hidden during the wait",
  [LOG_REASONS.mediaHourlyLimit]: "Media not sent: the account's hourly send limit was reached",
  ...LEGACY,
};

const UNEXPECTED: LogReason = { key: "Unexpected error while sending." };

/** The catalog message for a stored reason (null: nothing to show). */
export function describeLogReason(stored: string | null | undefined): LogReason | null {
  const text = stored?.trim();
  if (!text) return null;
  if (Object.hasOwn(FIXED, text)) return { key: FIXED[text] };

  let m = /^Monthly DM limit reached \((\d+)\)$/.exec(text);
  if (m) return { key: "Monthly DM limit reached ({limit})", values: { limit: Number(m[1]) } };

  m = /^Another campaign \((.*)\) already sent the one private reply Instagram allows for this comment$/.exec(text);
  if (m) {
    return m[1] && m[1] !== "unknown"
      ? { key: "Not sent: the automation “{name}” already sent the only private reply Instagram allows for this comment", values: { name: m[1] } }
      : { key: "Not sent: another automation already sent the only private reply Instagram allows for this comment" };
  }

  m = /^Media not fully sent \((\d+)\/(\d+) failed\): ([\s\S]*)$/.exec(text);
  if (m) {
    return { key: "Media only partly sent ({failed} of {total} failed).", values: { failed: Number(m[1]), total: Number(m[2]) } };
  }

  // The send may have reached the person: never retried on its own.
  if (text.includes("Message delivery is unconfirmed")) {
    return { key: "Instagram did not confirm the delivery, so it is not retried automatically. Check the conversation on Instagram before sending again." };
  }

  return describeProviderError(text) ?? UNEXPECTED;
}

/**
 * An Instagram (Meta) or connection-provider error, as the worker formats it:
 * "PermissionError 10: (#10) ... [code=10 sub=2534022 ...]" today,
 * "MetaApiError 100: ..." in earlier versions, "ZernioApiError 503: ...".
 */
function describeProviderError(text: string): LogReason | null {
  const named = /^(\w*Error) (\d+):/.exec(text);
  const bracket = /\[code=(\d+)\b/.exec(text);
  if (!named && !bracket) return null;
  const code = Number(bracket?.[1] ?? named?.[2]);
  const subMatch = /\bsub=(\d+)\b/.exec(text);
  // Earlier versions stored Meta's text without the subcode: the text tells
  // the common cases apart.
  const sub = subMatch
    ? Number(subMatch[1])
    : /invalid for a private reply/i.test(text)
      ? 2534025
      : /outside (of )?(the )?allowed window/i.test(text)
        ? 2534022
        : /does not exist/i.test(text)
          ? 33
          : null;

  if (named?.[1].startsWith("Zernio")) {
    return { key: "The connection provider refused the request (HTTP {code}).", values: { code } };
  }
  if (code === 190) return { key: "The connection to Instagram expired. Reconnect the account in Accounts." };
  if (code === 368) return { key: "Instagram temporarily blocked this action on the account (limits or spam protection)." };
  if ([4, 17, 32, 613].includes(code)) return { key: "Instagram temporarily limited this account's requests." };
  if (code === 10 && sub === 2534022) {
    return { key: "Instagram no longer allows replying to this person: the allowed time has passed." };
  }
  if (code === 100 && sub === 2534025) {
    return { key: "Instagram does not accept a private reply to this comment (it may already have one, or be too old)." };
  }
  if (code === 100 && sub === 33) return { key: "The comment or message no longer exists on Instagram." };
  if (code === 100 && sub === 2534014) return { key: "Instagram did not find this person." };
  if (code === 551) return { key: "This person cannot receive messages right now." };
  if ([3, 10, 200].includes(code)) return { key: "Instagram denied permission for this action. Reconnect the account in Accounts." };
  if (code === 1 || code === 2 || (code >= 500 && code < 600)) return { key: "Temporary Instagram error." };
  return sub !== null
    ? { key: "Instagram refused the send (code {code}, subcode {sub}).", values: { code, sub } }
    : { key: "Instagram refused the send (code {code}).", values: { code } };
}

/** The text the client sees for a stored reason, in the interface language. */
export function logReasonText(stored: string | null | undefined, t: I18n["t"]): string {
  const reason = describeLogReason(stored);
  if (!reason) return "";
  const translate = t as (key: MessageKey, values?: Record<string, string | number>) => string;
  return translate(reason.key, reason.values);
}
