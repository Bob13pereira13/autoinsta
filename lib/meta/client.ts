import { getMetaGraphApiVersion, requireSecret } from "@/lib/env";
import {
  BUTTON_TEXT_MAX_CHARS,
  BUTTON_TITLE_MAX_CHARS,
  TEXT_MAX_BYTES,
  truncateChars,
  truncateUtf8,
} from "@/lib/automation/message-limits";

/**
 * An Instagram User access token (Instagram API with Instagram Login, also
 * called Business Login for Instagram): a bare string, or the Instagram META
 * context, which satisfies the object form. Every call goes to
 * graph.instagram.com.
 */
export type MetaAuth = string | { accessToken: string };

function tokenOf(auth: MetaAuth): string {
  return typeof auth === "string" ? auth : auth.accessToken;
}

// The Instagram API with Instagram Login only answers on graph.instagram.com.
// (`auth` stays in the signature: every call names the token it uses.)
function instagramGraphBase() {
  return `https://graph.instagram.com/${getMetaGraphApiVersion()}`;
}

export class MetaApiError extends Error {
  constructor(
    public code: number,
    public subcode: number | undefined,
    public fbTraceId: string | undefined,
    message: string
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

// These subclasses carry the subcode and the code Meta actually sent. The
// subcode is the only thing that separates a permanent rejection (a comment
// not eligible for a private reply, sub=2534025) from one worth retrying, and
// the fixed code made a 10 or a 200 arrive as a 100 — which is what
// `isTemplateRejection` in the DM worker tests for before it tries another
// send. Both arguments default to the previous values, so existing call sites
// are unaffected.
export class TokenExpiredError extends MetaApiError {
  constructor(message: string, fbTraceId?: string, subcode?: number) {
    super(190, subcode, fbTraceId, message);
    this.name = "TokenExpiredError";
  }
}

export class RateLimitError extends MetaApiError {
  constructor(
    message: string,
    fbTraceId?: string,
    subcode?: number,
    code = 368
  ) {
    super(code, subcode, fbTraceId, message);
    this.name = "RateLimitError";
  }
}

export class PermissionError extends MetaApiError {
  constructor(
    message: string,
    fbTraceId?: string,
    subcode?: number,
    code = 100
  ) {
    super(code, subcode, fbTraceId, message);
    this.name = "PermissionError";
  }
}

interface GraphApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface InstagramUser {
  id: string;
  // Instagram professional account ID. This — not `id` (the app-scoped ID) —
  // is what appears as entry.id in webhooks and is used by the messaging API.
  user_id?: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
}

export interface InstagramComment {
  id: string;
  text: string;
  from?: {
    id: string;
    username?: string;
  };
  timestamp: string;
  // Present when the comments query asks for replies{from}. Used to tell whether
  // the account owner has already replied to this comment.
  replies?: {
    data?: { id: string; from?: { id: string; username?: string } }[];
  };
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
}

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok || (data as GraphApiError).error) {
    const err = (data as GraphApiError).error;
    const code = err?.code ?? response.status;
    const subcode = err?.error_subcode;
    const traceId = err?.fbtrace_id;
    // Without the path a Meta error is unattributable: a connect runs several
    // calls in a row that fail with the identical message. The query string is
    // dropped on purpose — it carries the access token.
    let path = "";
    try {
      path = ` (${new URL(response.url).pathname})`;
    } catch {}
    const message = `${err?.message ?? "Unknown Meta API error"}${path} [code=${code} sub=${subcode ?? "-"} type=${err?.type ?? "-"} trace=${traceId ?? "-"}]`;

    switch (code) {
      case 190:
        throw new TokenExpiredError(message, traceId, subcode);
      case 368:
      case 4:
      case 17:
        throw new RateLimitError(message, traceId, subcode, code);
      case 10:
      case 100:
      case 200:
        throw new PermissionError(message, traceId, subcode, code);
      default:
        throw new MetaApiError(code, subcode, traceId, message);
    }
  }

  return data as T;
}

export async function sendPrivateReply(
  auth: MetaAuth,
  instagramAccountId: string,
  commentId: string,
  message: string
): Promise<{ recipient_id: string; message_id: string }> {
  const accessToken = tokenOf(auth);
  const response = await fetch(
    `${instagramGraphBase()}/${instagramAccountId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        // Plain text: at most 1000 bytes of UTF-8 (cut between characters).
        message: { text: truncateUtf8(message, TEXT_MAX_BYTES) },
      }),
    }
  );

  return handleResponse(response);
}

/**
 * Send a private reply to a comment as a button template — an opening message
 * plus a postback button. Tapping the button opens the conversation and fires
 * a `messaging_postbacks` webhook carrying `payload`, which we use to deliver
 * the follow-up ("reveal") message.
 */
export async function sendPrivateReplyWithButton(
  auth: MetaAuth,
  instagramAccountId: string,
  commentId: string,
  text: string,
  buttonTitle: string,
  payload: string
): Promise<{ recipient_id: string; message_id: string }> {
  const accessToken = tokenOf(auth);
  const response = await fetch(
    `${instagramGraphBase()}/${instagramAccountId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              // Button template text is capped at 640 characters by Meta.
              text: truncateChars(text, BUTTON_TEXT_MAX_CHARS),
              buttons: [
                { type: "postback", title: truncateChars(buttonTitle, BUTTON_TITLE_MAX_CHARS), payload },
              ],
            },
          },
        },
      }),
    }
  );

  return handleResponse(response);
}

/**
 * Send a direct message (to a user's IGSID) as a button template with a single
 * postback button. Used to re-prompt a user during follow-gating, so tapping
 * the button fires another `messaging_postbacks` webhook carrying `payload`.
 */
export async function sendDirectMessageWithButton(
  auth: MetaAuth,
  instagramAccountId: string,
  userId: string,
  text: string,
  buttonTitle: string,
  payload: string
): Promise<{ recipient_id: string; message_id: string }> {
  const accessToken = tokenOf(auth);
  const response = await fetch(
    `${instagramGraphBase()}/${instagramAccountId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: userId },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: truncateChars(text, BUTTON_TEXT_MAX_CHARS),
              buttons: [
                { type: "postback", title: truncateChars(buttonTitle, BUTTON_TITLE_MAX_CHARS), payload },
              ],
            },
          },
        },
      }),
    }
  );

  return handleResponse(response);
}

/**
 * Check whether a user (by their IGSID) follows the business account, via the
 * Instagram Messaging profile API. Available for users in an active
 * conversation (e.g. after a private reply or a button tap). Returns true or
 * false, or `null` when Meta does not return the field — so callers can decide
 * how to treat the unverifiable case.
 */
export async function getUserFollowStatus(
  auth: MetaAuth,
  recipientId: string
): Promise<boolean | null> {
  const accessToken = tokenOf(auth);
  const url = new URL(`${instagramGraphBase()}/${recipientId}`);
  url.searchParams.set("fields", "is_user_follow_business");

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.is_user_follow_business === "boolean"
      ? data.is_user_follow_business
      : null;
  } catch {
    return null;
  }
}

/**
 * The handle behind an IGSID, for personalizing a message to someone who
 * messaged the account. The messages and postbacks webhooks carry only the
 * sender's id, unlike the comments webhook, which carries the username.
 *
 * Instagram answers this for anyone who has an open conversation with the
 * account, which is exactly who arrives on those two paths. null when the
 * handle cannot be read, so the caller falls back as before.
 */
export async function getUserUsername(
  auth: MetaAuth,
  recipientId: string
): Promise<string | null> {
  const accessToken = tokenOf(auth);
  const url = new URL(`${instagramGraphBase()}/${recipientId}`);
  url.searchParams.set("fields", "username");

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.username === "string" && data.username
      ? data.username
      : null;
  } catch {
    return null;
  }
}

/**
 * A tappable web_url button in a DM button template. Instagram's button
 * template supports up to 3 buttons; titles are capped at 20 chars by Meta.
 */
export interface LinkButton {
  title: string;
  url: string;
}

function toWebUrlButtons(buttons: LinkButton[]) {
  return buttons
    .slice(0, 3)
    .map((b) => ({ type: "web_url", url: b.url, title: truncateChars(b.title, BUTTON_TITLE_MAX_CHARS) }));
}

/**
 * Send a private reply to a comment as a button template with up to 3 web_url
 * buttons — the reveal message plus tappable link buttons (for campaigns with
 * no opening DM, where the reveal is delivered straight to the comment).
 */
export async function sendPrivateReplyWithLinkButton(
  auth: MetaAuth,
  instagramAccountId: string,
  commentId: string,
  text: string,
  buttons: LinkButton[]
): Promise<{ recipient_id: string; message_id: string }> {
  const accessToken = tokenOf(auth);
  const response = await fetch(
    `${instagramGraphBase()}/${instagramAccountId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: truncateChars(text, BUTTON_TEXT_MAX_CHARS),
              buttons: toWebUrlButtons(buttons),
            },
          },
        },
      }),
    }
  );

  return handleResponse(response);
}

/**
 * Send a plain-text direct message to a user by their Instagram-scoped ID.
 * Used to deliver the reveal message after a button postback.
 */
export async function sendDirectMessage(
  auth: MetaAuth,
  instagramAccountId: string,
  userId: string,
  message: string
): Promise<{ recipient_id: string; message_id: string }> {
  const accessToken = tokenOf(auth);
  const response = await fetch(
    `${instagramGraphBase()}/${instagramAccountId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: userId },
        // Plain text: at most 1000 bytes of UTF-8 (cut between characters).
        message: { text: truncateUtf8(message, TEXT_MAX_BYTES) },
      }),
    }
  );

  return handleResponse(response);
}

/**
 * Send a direct message as a button template with up to 3 web_url buttons —
 * the reveal message plus tappable link buttons (cleaner than inline URLs).
 */
export type DirectAttachment = { type: "image" | "video"; url: string };

/**
 * Send one image or video by public URL (Meta downloads it). Images: PNG/JPEG
 * up to 8 MB; video: MP4/MOV/WEBM up to 25 MB. Only works inside an open
 * conversation (the person messaged or tapped a button) — never as a private
 * reply to a comment, which Meta documents as text only.
 *
 * Instagram Login documents images in an `attachments` array and video as a
 * single `attachment`. An image rejected in the array shape (invalid
 * parameter) is retried once as a single `attachment`.
 */
export async function sendDirectAttachment(
  auth: MetaAuth,
  instagramAccountId: string,
  userId: string,
  attachment: DirectAttachment
): Promise<{ recipient_id: string; message_id: string }> {
  const accessToken = tokenOf(auth);
  const post = async (message: Record<string, unknown>) =>
    handleResponse<{ recipient_id: string; message_id: string }>(
      await fetch(`${instagramGraphBase()}/${instagramAccountId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ recipient: { id: userId }, message }),
      })
    );

  const single = { attachment: { type: attachment.type, payload: { url: attachment.url } } };
  if (attachment.type !== "image") return post(single);

  const array = { attachments: [{ type: "image", payload: { url: attachment.url } }] };
  const [first, second] = [array, single];
  try {
    return await post(first);
  } catch (err) {
    if (err instanceof MetaApiError && err.code === 100 && !/window|not.*follow|cannot be found/i.test(err.message)) {
      return post(second);
    }
    throw err;
  }
}

export async function sendDirectMessageWithLinkButton(
  auth: MetaAuth,
  instagramAccountId: string,
  userId: string,
  text: string,
  buttons: LinkButton[]
): Promise<{ recipient_id: string; message_id: string }> {
  const accessToken = tokenOf(auth);
  const response = await fetch(
    `${instagramGraphBase()}/${instagramAccountId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: userId },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: truncateChars(text, BUTTON_TEXT_MAX_CHARS),
              buttons: toWebUrlButtons(buttons),
            },
          },
        },
      }),
    }
  );

  return handleResponse(response);
}

export async function sendCommentReply(
  auth: MetaAuth,
  commentId: string,
  message: string
): Promise<{ id: string }> {
  const accessToken = tokenOf(auth);
  const response = await fetch(
    `${instagramGraphBase()}/${commentId}/replies`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ message }),
    }
  );

  return handleResponse(response);
}

/**
 * A comment just before a delayed reply: deleted (Meta answers code 100,
 * subcode 33, "does not exist"), hidden by the account, or there, and whether
 * the account itself has already replied to it. One call.
 */
export async function getCommentState(
  auth: MetaAuth,
  commentId: string,
  accountInstagramId: string
): Promise<{ state: "deleted" | "hidden" | "visible"; ownerReplied: boolean }> {
  const url = new URL(`${instagramGraphBase()}/${commentId}`);
  url.searchParams.set("fields", "id,hidden,replies.limit(100){from}");
  url.searchParams.set("access_token", tokenOf(auth));
  let data: { hidden?: boolean; replies?: { data?: { from?: { id?: string } }[] } };
  try {
    data = await handleResponse(await fetch(url.toString()));
  } catch (error) {
    if (error instanceof MetaApiError && error.code === 100 && error.subcode === 33) {
      return { state: "deleted", ownerReplied: false };
    }
    throw error;
  }
  return {
    state: data.hidden ? "hidden" : "visible",
    ownerReplied: (data.replies?.data ?? []).some((r) => r.from?.id === accountInstagramId),
  };
}

export async function getMediaComments(
  auth: MetaAuth,
  mediaId: string
): Promise<InstagramComment[]> {
  const accessToken = tokenOf(auth);
  const url = new URL(`${instagramGraphBase()}/${mediaId}/comments`);
  url.searchParams.set("fields", "id,text,from,timestamp");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  const data = await handleResponse<{ data: InstagramComment[] }>(response);
  return data.data;
}

/**
 * Recent comments on a media, newest first, each with its replies so the caller
 * can tell whether the account owner has already responded. Pagination stops as
 * soon as it reaches comments older than `sinceMs` (or the `max` ceiling), so a
 * viral post's entire back-catalogue is never pulled — only what is recent
 * enough to still act on. This is what the polling reconciler reads.
 *
 * Note: comments hidden by Instagram's Hidden Words / spam filter may not be
 * returned by the Graph API at all. Disable that filter on the account to widen
 * results.
 */
export async function getRecentMediaComments(
  auth: MetaAuth,
  mediaId: string,
  sinceMs: number,
  max = 800
): Promise<InstagramComment[]> {
  const accessToken = tokenOf(auth);
  const results: InstagramComment[] = [];

  const first = new URL(`${instagramGraphBase()}/${mediaId}/comments`);
  first.searchParams.set("fields", "id,text,timestamp,from,replies{from}");
  first.searchParams.set("order", "reverse_chronological");
  first.searchParams.set("limit", "50");
  first.searchParams.set("access_token", accessToken);

  let nextUrl: string | null = first.toString();

  while (nextUrl !== null && results.length < max) {
    const response: Response = await fetch(nextUrl);
    const page = await handleResponse<{
      data: InstagramComment[];
      paging?: { next?: string };
    }>(response);
    const data = page.data ?? [];
    results.push(...data);

    // Newest-first, so once the last item on a page predates the window there
    // is nothing older worth fetching.
    const oldest = data[data.length - 1];
    if (oldest?.timestamp && Date.parse(oldest.timestamp) < sinceMs) break;
    nextUrl = page.paging?.next ?? null;
  }

  return results
    .filter((c) => !c.timestamp || Date.parse(c.timestamp) >= sinceMs)
    .slice(0, max);
}

// With an Instagram User token `me` is the Instagram professional account.
const ME = "me";

export async function getUserInfo(auth: MetaAuth): Promise<InstagramUser> {
  const accessToken = tokenOf(auth);
  const node = ME;
  const url = new URL(`${instagramGraphBase()}/${node}`);
  // `id` is app-scoped; `user_id` is the professional account ID, the `id`
  // Meta puts in every webhook for this account (the one to store).
  url.searchParams.set("fields", "id,user_id,username,name,profile_picture_url");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  return handleResponse<InstagramUser>(response);
}

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count";

// Instagram caps a single media page at 100 items.
const MEDIA_PAGE_SIZE = 100;

export async function getUserMedia(auth: MetaAuth, limit = 25): Promise<InstagramMedia[]> {
  const accessToken = tokenOf(auth);
  const node = ME;
  const url = new URL(`${instagramGraphBase()}/${node}/media`);
  url.searchParams.set("fields", MEDIA_FIELDS);
  url.searchParams.set("limit", limit.toString());
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  const data = await handleResponse<{ data: InstagramMedia[] }>(response);
  return data.data;
}

/**
 * One page of the account's media, newest first, for infinite scrolling.
 * `after` is the cursor of the previous page; `nextCursor` is null on the last.
 */
export async function getUserMediaPage(
  auth: MetaAuth,
  { limit = 24, after }: { limit?: number; after?: string | null }
): Promise<{ data: InstagramMedia[]; nextCursor: string | null }> {
  const accessToken = tokenOf(auth);
  const node = ME;
  const url = new URL(`${instagramGraphBase()}/${node}/media`);
  url.searchParams.set("fields", MEDIA_FIELDS);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), MEDIA_PAGE_SIZE)));
  if (after) url.searchParams.set("after", after);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  const page = await handleResponse<{
    data: InstagramMedia[];
    paging?: { next?: string; cursors?: { after?: string } };
  }>(response);
  const data = page.data ?? [];
  const nextCursor = page.paging?.next && data.length ? page.paging.cursors?.after ?? null : null;
  return { data, nextCursor };
}

/**
 * Fetch media by following pagination cursors until `max` items are collected
 * or there are no more pages. Pass a large `max` for an "all time" view; the
 * cap is a safety ceiling so an account with thousands of posts can't spin
 * forever.
 */
export async function getAllUserMedia(auth: MetaAuth, max = 500): Promise<InstagramMedia[]> {
  const accessToken = tokenOf(auth);
  const results: InstagramMedia[] = [];

  const node = ME;
  const first = new URL(`${instagramGraphBase()}/${node}/media`);
  first.searchParams.set("fields", MEDIA_FIELDS);
  first.searchParams.set("limit", String(Math.min(MEDIA_PAGE_SIZE, max)));
  first.searchParams.set("access_token", accessToken);

  let nextUrl: string | null = first.toString();

  while (nextUrl !== null && results.length < max) {
    const response: Response = await fetch(nextUrl);
    const page = await handleResponse<{
      data: InstagramMedia[];
      paging?: { next?: string };
    }>(response);
    results.push(...page.data);
    nextUrl = page.paging?.next ?? null;
  }

  return results.slice(0, max);
}

// Exchanges the short-lived token from the OAuth code for a 60-day one.
export async function getLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${instagramGraphBase()}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", requireSecret("INSTAGRAM_APP_SECRET"));
  url.searchParams.set("access_token", shortLivedToken);

  const response = await fetch(url.toString());
  const data = await handleResponse<TokenResponse>(response);

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 5184000,
  };
}

// Renews a 60-day token for another 60 days (the token must be at least 24
// hours old and still valid). Run daily by the token refresh cron.
export async function refreshLongLivedToken(
  longLivedToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${instagramGraphBase()}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", longLivedToken);

  const response = await fetch(url.toString());
  const data = await handleResponse<TokenResponse>(response);

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 5184000,
  };
}

/**
 * Account-level webhook fields (Instagram API with Instagram Login): comments,
 * DMs and story replies/mentions (messages), button taps (messaging_postbacks)
 * and the account's own sends (message_echoes, its own field in this login:
 * how the app tells its messages from a person's and pauses while the team
 * talks). Read receipts (messaging_seen) are not subscribed.
 */
export const WEBHOOK_FIELDS = ["comments", "messages", "messaging_postbacks", "message_echoes"] as const;
// Tried in order when Meta refuses a field (invalid parameter): the app keeps
// as much as it can, and comments + DMs always.
const FALLBACK_WEBHOOK_FIELDS: ReadonlyArray<readonly string[]> = [
  ["comments", "messages", "messaging_postbacks"],
  ["comments", "messages"],
];

/**
 * Turns on notifications for one account: POST /me/subscribed_apps on
 * graph.instagram.com with the account's Instagram User token. Which fields
 * arrive is also decided per app, in the App Dashboard ("API setup with
 * Instagram login" → Configure webhooks). Returns the fields asked for (a
 * smaller set when Meta refused one).
 */
export async function subscribeInstagramAccountToWebhooks(
  instagramAccountId: string,
  auth: MetaAuth
): Promise<{ success: boolean; fields: readonly string[] }> {
  const accessToken = tokenOf(auth);
  const subscribe = async (fields: readonly string[]) => ({
    ...(await handleResponse<{ success: boolean }>(
      await fetch(`${instagramGraphBase()}/${instagramAccountId}/subscribed_apps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ subscribed_fields: fields }),
      })
    )),
    fields,
  });

  const attempts = [WEBHOOK_FIELDS, ...FALLBACK_WEBHOOK_FIELDS];
  for (let i = 0; ; i++) {
    try {
      return await subscribe(attempts[i]);
    } catch (err) {
      // An app whose webhook product lacks one of the extra fields gets an
      // invalid-parameter error; keep comments and DMs working regardless.
      const last = i === attempts.length - 1;
      if (!last && err instanceof MetaApiError && err.code === 100 && !(err instanceof TokenExpiredError)) {
        console.warn("[Instagram] Webhook fields refused, trying fewer:", err.message);
        continue;
      }
      throw err;
    }
  }
}

/** What Meta says the account is subscribed to: the apps and the fields of each. */
export async function getInstagramAccountSubscriptions(
  instagramAccountId: string,
  auth: MetaAuth
): Promise<Array<{ id: string | null; name: string | null; fields: string[] }>> {
  const url = new URL(`${instagramGraphBase()}/${instagramAccountId}/subscribed_apps`);
  url.searchParams.set("access_token", tokenOf(auth));
  const data = await handleResponse<{ data?: Array<{ id?: string; name?: string; subscribed_fields?: unknown }> }>(
    await fetch(url.toString())
  );
  return (data.data ?? []).map((app) => ({
    id: app.id ? String(app.id) : null,
    name: app.name ? String(app.name) : null,
    fields: Array.isArray(app.subscribed_fields) ? app.subscribed_fields.map((f) => String(typeof f === "object" && f && "name" in f ? (f as { name: unknown }).name : f)) : [],
  }));
}
