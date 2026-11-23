/**
 * Instagram notifications (webhooks) of one connected account: turn them on
 * and ask Meta what it actually confirms, then record it in the admin's
 * Diagnostics. Run on every connection and from the admin's "Check
 * notifications" button.
 *
 * With a Unified login token (Business Integration System User Access Token)
 * Meta documents the subscription as POST /{instagram-account-id}/subscribed_apps
 * on graph.facebook.com with that token; no Facebook Page is needed. Which
 * fields arrive is decided per app, in the App Dashboard: an account receives
 * every field selected for the app. So when comments arrive and messages do
 * not, the account is subscribed and the cause is elsewhere (the fields
 * selected on the "API setup with Unified login" tab, the app's mode, or
 * another app owning the conversations); the record says which fields Meta
 * confirms for the account, to rule out the subscription itself.
 */
import { prisma } from "@/lib/db/client";
import { getMetaAppId } from "@/lib/env";
import {
  getInstagramAccountSubscriptions,
  subscribeInstagramAccountToWebhooks,
  WEBHOOK_FIELDS,
  type MetaAuth,
} from "@/lib/meta/client";

export interface WebhookCheck {
  /** Subscribed and every field the app needs confirmed by Meta. */
  ok: boolean;
  /** The subscription call went through (null: not attempted). */
  subscribed: boolean | null;
  requestedFields: readonly string[];
  /** The fields Meta lists for this app on the account (null: could not ask). */
  confirmedFields: string[] | null;
  /** Needed fields Meta does not confirm. */
  missing: string[];
  subscribeError: string | null;
  checkError: string | null;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

export async function subscribeAndCheckWebhooks(input: {
  instagramId: string;
  username: string;
  auth: MetaAuth;
  workspaceId: string | null;
  /** false: only ask Meta what is subscribed. */
  subscribe?: boolean;
}): Promise<WebhookCheck> {
  const { instagramId, username, auth, workspaceId } = input;
  let subscribed: boolean | null = null;
  let requestedFields: readonly string[] = [];
  let subscribeError: string | null = null;
  if (input.subscribe !== false) {
    try {
      const result = await subscribeInstagramAccountToWebhooks(instagramId, auth);
      subscribed = Boolean(result.success);
      requestedFields = result.fields;
      if (!subscribed) subscribeError = "Meta answered success: false";
    } catch (error) {
      subscribed = false;
      subscribeError = message(error);
    }
  }

  let confirmedFields: string[] | null = null;
  let checkError: string | null = null;
  let apps: Array<{ id: string | null; name: string | null; fields: string[] }> = [];
  try {
    apps = await getInstagramAccountSubscriptions(instagramId, auth);
    const appId = getMetaAppId();
    // This app's entry: by id when Meta gives it, else the only entry there is.
    const mine = apps.find((app) => appId && app.id === appId) ?? (apps.length === 1 && !apps[0].id ? apps[0] : undefined);
    confirmedFields = mine ? mine.fields : [];
  } catch (error) {
    checkError = message(error);
  }

  const missing = confirmedFields === null ? [] : WEBHOOK_FIELDS.filter((field) => !confirmedFields!.includes(field));
  const ok = !subscribeError && !checkError && missing.length === 0;
  const level = subscribeError || checkError ? "ERROR" : missing.length ? "WARNING" : "INFO";
  const text = subscribeError
    ? `Instagram notifications for @${username}: subscription failed`
    : checkError
      ? `Instagram notifications for @${username}: subscribed, but Meta's confirmation could not be read`
      : missing.length
        ? `Instagram notifications for @${username}: Meta does not confirm ${missing.join(", ")}`
        : `Instagram notifications for @${username}: Meta confirms ${confirmedFields!.join(", ")}`;

  await prisma.operationalEvent
    .create({
      data: {
        source: "SYSTEM",
        level,
        workspaceId,
        message: text,
        payload: {
          instagramId,
          requestedFields: [...requestedFields],
          confirmedFields,
          missing,
          appsOnAccount: apps.map((app) => ({ id: app.id, name: app.name, fields: app.fields })),
          ...(subscribeError ? { subscribeError } : {}),
          ...(checkError ? { checkError } : {}),
        },
      },
    })
    .catch((error) => console.error("[webhooks] Could not record the check:", error));

  return { ok, subscribed, requestedFields, confirmedFields, missing, subscribeError, checkError };
}
