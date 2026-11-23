import { createHmac, timingSafeEqual } from "crypto";
import { usableSecret } from "@/lib/env-safety";

/**
 * Validates Meta's `X-Hub-Signature-256` header: `sha256=` + hex HMAC-SHA256 of
 * the exact request body, keyed with the app secret.
 *
 * Pass the raw body bytes when you have them (the webhook route does): hashing
 * a re-encoded string only matches when the body was valid UTF-8.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string | null
): boolean {
  if (!signature) return false;

  // Instagram's login: the Instagram app secret (API setup with Instagram
  // login). Meta's webhook guide names the app secret of App settings →
  // Basic (FACEBOOK_APP_SECRET); both belong to the same app, so a signature
  // that matches either is accepted.
  const secrets = getAppSecrets();

  if (secrets.length === 0) {
    throw new Error(
      "FACEBOOK_APP_SECRET or INSTAGRAM_APP_SECRET is required to verify webhooks"
    );
  }

  return secrets.some((secret) => {
    const expected =
      "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
    const received = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    return received.length === wanted.length && timingSafeEqual(received, wanted);
  });
}

/**
 * App secrets Meta may sign with, Instagram app secret first. A placeholder
 * (e.g. "your-instagram-app-secret" from .env.example) is never used: it is
 * public, so anyone could sign a webhook or a data deletion request with it.
 */
export function getAppSecrets(): string[] {
  return [process.env.INSTAGRAM_APP_SECRET, process.env.FACEBOOK_APP_SECRET]
    .map(usableSecret)
    .filter((s): s is string => Boolean(s));
}

/** Constant-time check of the `hub.verify_token` sent when Meta registers the webhook. */
export function verifyWebhookVerifyToken(token: string | null): boolean {
  const expected = usableSecret(process.env.WEBHOOK_VERIFY_TOKEN);
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface WebhookCommentEvent {
  instagramAccountId: string;
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterName?: string;
  mediaId: string;
  /**
   * Set only when the comment was left on an ad: the id of the organic post
   * the ad was created from. Campaigns are configured against that post, so
   * matching has to consider it as well as mediaId.
   */
  originalMediaId?: string;
}

interface WebhookEntry {
  id: string;
  time: number;
  changes?: Array<{
    field: string;
    value: {
      id?: string;
      comment_id?: string;
      text?: string;
      from?: {
        id?: string;
        username?: string;
      };
      media?: {
        id?: string;
        // Present when media_product_type is "AD": the ad copy gets its own
        // media id, and this points back to the post it was boosted from.
        original_media_id?: string;
        ad_id?: string;
        media_product_type?: string;
      };
      media_id?: string;
    };
  }>;
  messaging?: Array<{
    sender?: { id?: string };
    recipient?: { id?: string };
    postback?: { mid?: string; title?: string; payload?: string };
    // Read receipt (messaging_seen): not subscribed any more; ignored if it arrives.
    read?: { watermark?: number; seq?: number };
    message?: {
      mid?: string;
      text?: string;
      is_echo?: boolean;
      is_deleted?: boolean;
      is_unsupported?: boolean;
      attachments?: Array<{ type?: string; payload?: { url?: string } }>;
      // Present when the message is a reply to one of the account's stories.
      reply_to?: { mid?: string; story?: { id?: string; url?: string } };
    };
  }>;
}

/**
 * Where an inbound message came from:
 * - STORY_REPLY: a reply to one of the account's stories (message.reply_to.story)
 * - STORY_MENTION: the person mentioned the account in their own story
 *   (attachment type "story_mention", no text)
 * - DIRECT: any other direct message
 */
export type MessageChannel = "DIRECT" | "STORY_REPLY" | "STORY_MENTION";

export interface WebhookMessageEvent {
  instagramAccountId: string;
  messageId: string;
  /** Empty for a mention or an attachment-only message. */
  messageText: string;
  senderId: string;
  channel: MessageChannel;
  storyId?: string;
}

/** A message the account itself sent (Instagram app, Business Suite, API). */
export interface WebhookEchoEvent {
  instagramAccountId: string;
  recipientId: string;
  messageId: string;
}

export interface WebhookPostbackEvent {
  instagramAccountId: string;
  userId: string;
  payload: string;
  mid?: string;
}

interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}

export function parseCommentEvents(payload: WebhookPayload): WebhookCommentEvent[] {
  const events: WebhookCommentEvent[] = [];

  if (payload.object !== "instagram") {
    return events;
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;

      const value = change.value;
      const commentId = value?.id ?? value?.comment_id;
      const mediaId = value?.media?.id ?? value?.media_id;
      // A comment on a boosted post arrives with the ad's media id, while the
      // campaign is set up against the organic post. Keep both so the worker
      // can match either one.
      const originalMediaId =
        value?.media?.original_media_id === mediaId
          ? undefined
          : value?.media?.original_media_id;
      const commenterId = value?.from?.id;

      if (!entry.id || !commentId || !mediaId || !commenterId) {
        continue;
      }

      // Skip the connected account's own comments and comment replies.
      // A private reply to yourself is rejected by Meta, so queueing one
      // only produces a failed log and wasted retries.
      if (commenterId === entry.id) {
        continue;
      }

      events.push({
        instagramAccountId: entry.id,
        commentId,
        commentText: value.text ?? "",
        commenterId,
        commenterName: value.from?.username,
        mediaId,
        originalMediaId,
      });
    }
  }

  return events;
}

/**
 * Parse button-tap postbacks (from an opening DM's button) out of a webhook
 * payload. Each event carries the tapping user's IGSID and our postback payload.
 */
export function parsePostbackEvents(
  payload: WebhookPayload
): WebhookPostbackEvent[] {
  const events: WebhookPostbackEvent[] = [];

  if (payload.object !== "instagram") return events;

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const postbackPayload = messaging.postback?.payload;
      const userId = messaging.sender?.id;
      const accountId = entry.id ?? messaging.recipient?.id;

      if (!postbackPayload || !userId || !accountId) continue;
      // Ignore echoes of the account's own actions.
      if (userId === accountId) continue;

      events.push({
        instagramAccountId: accountId,
        userId,
        payload: postbackPayload,
        mid: messaging.postback?.mid,
      });
    }
  }

  return events;
}

/**
 * Parse inbound Instagram messages out of a webhook payload and tell the
 * channel apart: story replies and story mentions go to STORIES automations,
 * everything else to DIRECT automations.
 *
 * Echoes (messages the account itself sent, including our own replies),
 * deletions and unsupported messages are dropped so the worker never sees
 * them — an echo would otherwise let an autoreply containing its own keyword
 * trigger itself. Messages with neither text nor attachments are dropped too.
 */
export function parseMessageEvents(
  payload: WebhookPayload
): WebhookMessageEvent[] {
  const events: WebhookMessageEvent[] = [];

  if (payload.object !== "instagram") return events;

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const message = messaging.message;
      if (!message) continue;
      if (message.is_echo || message.is_deleted || message.is_unsupported) {
        continue;
      }

      const text = message.text?.trim() ?? "";
      const attachments = message.attachments ?? [];
      const messageId = message.mid;
      const senderId = messaging.sender?.id;
      const accountId = entry.id ?? messaging.recipient?.id;

      if (!messageId || !senderId || !accountId) continue;
      if (!text && attachments.length === 0) continue;
      // Ignore anything the connected account sent to itself.
      if (senderId === accountId) continue;

      const mention = attachments.some((a) => a.type === "story_mention");
      const story = message.reply_to?.story;
      const channel: MessageChannel = mention
        ? "STORY_MENTION"
        : story
          ? "STORY_REPLY"
          : "DIRECT";

      events.push({
        instagramAccountId: accountId,
        messageId,
        // A mention carries no text the person typed; keyword automations
        // never fire on it.
        messageText: mention ? "" : text,
        senderId,
        channel,
        ...(story?.id ? { storyId: story.id } : {}),
      });
    }
  }

  return events;
}

/**
 * Messages the connected account sent. Instagram reports them all with
 * is_echo and no reliable way to tell the app that sent them, so the worker
 * compares the mid with the ones the automations sent (BotMessage): any other
 * echo was written by a person.
 */
export function parseEchoEvents(payload: WebhookPayload): WebhookEchoEvent[] {
  const events: WebhookEchoEvent[] = [];
  if (payload.object !== "instagram") return events;

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const message = messaging.message;
      if (!message?.is_echo || !message.mid) continue;
      const accountId = entry.id ?? messaging.sender?.id;
      const recipientId = messaging.recipient?.id;
      if (!accountId || !recipientId || recipientId === accountId) continue;
      events.push({ instagramAccountId: accountId, recipientId, messageId: message.mid });
    }
  }

  return events;
}
