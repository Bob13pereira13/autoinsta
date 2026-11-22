import {
  classifySendError,
  hasLegacyUnconfirmedDelivery,
  isConfirmedSendRejection,
  isDeliveryUnconfirmed,
} from "@/lib/instagram/delivery-errors";
import { claimCommentDelivery, MAX_COMMENT_SEND_ATTEMPTS } from "./comment-delivery";
import { createHash } from "node:crypto";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import {
  getDMQueue,
  getRedisConnection,
  ECHO_JOB_NAME,
  MESSAGE_JOB_NAME,
  POSTBACK_JOB_NAME,
  FOLLOWUP_JOB_NAME,
  type DmQueueJob,
  type ProcessCommentJob,
  type ProcessEchoJob,
  type ProcessMessageJob,
  type ProcessPostbackJob,
  type ProcessFollowUpJob,
} from "./client";
import { prisma } from "@/lib/db/client";
import {
  MetaApiError,
  RateLimitError,
  TokenExpiredError,
  getUserFollowStatus,
  resolveRecipientName,
  sendCommentReply,
} from "@/lib/instagram/provider";
// Same send functions as the provider's, plus a record of each message id the
// automations send (echoes of other ids come from a person; see guards.ts).
import {
  sendDirectAttachment,
  sendDirectMessage,
  sendDirectMessageWithButton,
  sendDirectMessageWithLinkButton,
  sendPrivateReply,
  sendPrivateReplyWithButton,
  sendPrivateReplyWithLinkButton,
} from "@/lib/automation/bot-send";
import { isGuardedAutomation, selectAutomation, type TriggerEvent } from "@/lib/automation/select";
import { claimReplyCooldown, handleEcho, humanRepliedSince, isHumanConversationActive } from "@/lib/automation/guards";
import { mediaPublicUrl } from "@/lib/media/urls";
import {
  createInstagramContext,
  hasInstagramCredentials,
  type InstagramContext,
} from "@/lib/instagram/provider";
import { countSendCalls, reserveDMSlot, releaseDMSlot, reserveSendSlots } from "@/lib/utils/rate-limiter";
import {
  releaseWorkspaceDMReservation,
  reserveWorkspaceDMSend,
} from "@/lib/billing/usage";
import { recordWorkerAlert } from "@/lib/ops/worker-health";
import {
  buildTrackedUrl,
  renderMessageWithTracking,
  renderMessageWithoutLink,
} from "@/lib/tracking/message";
import { TRACKED_LINK_ORDER } from "@/lib/tracking/link-order";
import { hashRecipientId } from "@/lib/tracking/server";

import { ZernioApiError } from "@/lib/zernio/client";
import {
  DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL,
  DEFAULT_FOLLOW_PROMPT_MESSAGE,
  DEFAULT_LINK_BUTTON_LABEL,
  DEFAULT_LINK_ONLY_TEXT,
} from "@/lib/campaigns/defaults";

const BACKOFF_DELAYS = [5 * 60 * 1000, 15 * 60 * 1000, 45 * 60 * 1000];

// How long to wait before re-checking a follow that came back false: one
// delay per re-check, each counted from the previous check.
//
// `is_user_follow_business` does not reflect a brand-new follow right away, and
// the follow gate asks people to follow and tap a button that is sitting in
// front of them — so tapping seconds after following is the normal case, not
// the exception. Rejecting on the first `false` therefore turns away the exact
// people who did what was asked, and they get told to follow an account they
// already follow.
//
// Two checks rather than one long wait: measured, a follow still read `false`
// 17 s after it happened and `true` by ~68 s. An early check catches the fast
// ones sooner; the last still covers the slow ones.
const FOLLOW_RECHECK_DELAYS_MS = (
  process.env.FOLLOW_RECHECK_DELAYS_MS ?? "20000,40000"
)
  .split(",")
  .map(Number)
  .filter((ms) => ms > 0);
const FOLLOW_RECHECK_TOTAL_MS = FOLLOW_RECHECK_DELAYS_MS.reduce(
  (total, ms) => total + ms,
  0
);

/**
 * Sends Meta answered with an error but may well have delivered anyway.
 *
 * Meta returns the generic code 1 OAuthException on /messages *after* the DM
 * has reached the recipient — observed in production: a user tapped the reply's
 * button 30 seconds after a send this worker had already marked FAILED. Logging
 * that as a plain failure is harmful twice over: the job is retried (up to
 * BACKOFF_DELAYS.length times, each retry another copy in the same inbox), and
 * the comment never satisfies the reconciler's "handled" test, so every sweep
 * re-enqueues it for the whole lookback window. Together that sent one person
 * dozens of identical DMs.
 *
 * Flagging it as unconfirmed instead is exactly what dmDeliveryUnconfirmed is
 * for: the sweep's dedup already treats that as handled, and processComment
 * skips a DM whose delivery is unconfirmed. The trade-off is deliberate — a
 * code 1 that really did fail means that person gets no DM and can comment
 * again, which is far better than spamming someone who already received it.
 */

function formatError(error: unknown): string {
  if (error instanceof MetaApiError) {
    return `${error.name} ${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

// Meta rejections that a plain-text retry cannot fix: the send was refused for
// the conversation, not for the button template. Retrying as text just burns
// the attempt and — worse — overwrites the real error with a misleading one
// ("invalid for a private reply", because the first attempt already used up the
// comment's single allowed private reply).
const NON_TEMPLATE_REJECTIONS = [
  /outside of allowed window/i,
  /invalid for a private reply/i,
  /requested user cannot be found/i,
];

function isTemplateRejection(error: unknown): boolean {
  if (
    error instanceof TokenExpiredError ||
    error instanceof RateLimitError ||
    error instanceof ZernioApiError
  ) {
    return false;
  }
  // Falling back is another send: allow it only for a proven template error.
  return error instanceof MetaApiError && error.code === 100 &&
    /template|button/i.test(error.message) &&
    !NON_TEMPLATE_REJECTIONS.some((pattern) => pattern.test(error.message));
}

type WorkerTrackedLink = {
  slug: string;
  label: string | null;
  destinationUrl: string;
};

/**
 * Build the tappable link buttons for a DM. The first link uses the campaign's
 * `linkButtonLabel`; each additional link uses its own stored `label`. Capped at
 * Meta's 3-button limit for a button template.
 */
function buildLinkButtons(
  trackedLinks: WorkerTrackedLink[],
  primaryLabel: string | null,
  recipientToken: string
): { title: string; url: string }[] {
  // The first link's own label is an internal placeholder ("Primary campaign
  // link"), never a button text: without the campaign's label it falls back
  // to the default.
  return trackedLinks.slice(0, 3).map((link, index) => ({
    url: buildTrackedUrl(link.slug, undefined, recipientToken),
    title: (index === 0 ? primaryLabel : link.label)?.trim() || DEFAULT_LINK_BUTTON_LABEL,
  }));
}

/**
 * Fallback text when Meta rejects the button template: render the primary link
 * inline, then append any extra tracked URLs on their own lines so no link is
 * lost.
 */
function buildInlineLinkFallback(
  message: string,
  commenterName: string | null | undefined,
  trackedLinks: WorkerTrackedLink[],
  bodyText: string,
  recipientToken: string
): string {
  const base =
    renderMessageWithTracking({
      message,
      commenterName,
      trackedLinks,
      recipientToken,
    }) || bodyText;
  const extraUrls = trackedLinks
    .slice(1)
    .map((link) => buildTrackedUrl(link.slug, undefined, recipientToken));
  return extraUrls.length > 0 ? `${base}\n${extraUrls.join("\n")}` : base;
}

type RevealAutomation = {
  dmMessage: string;
  linkButtonLabel: string | null;
  trackedLinks: WorkerTrackedLink[];
  instagramAccount: { instagramId: string };
};

/**
 * Deliver a campaign's reveal message as a direct message. Shared by the
 * button-tap (postback) path and the DM keyword-trigger path — both already
 * have an open conversation with the user, so neither uses a private reply.
 */
async function sendRevealDirectMessage({
  accessToken,
  automation,
  userId,
  commenterName,
  context,
}: {
  accessToken: InstagramContext;
  automation: RevealAutomation;
  userId: string;
  commenterName: string | null;
  context: string;
}): Promise<void> {
  if (automation.trackedLinks.length === 0) {
    await sendDirectMessage({
      context: accessToken,
      instagramAccountId: automation.instagramAccount.instagramId,
      userId: userId,
      message: renderMessageWithTracking({
        message: automation.dmMessage,
        commenterName,
        trackedLinks: automation.trackedLinks,
      }),
    });
    return;
  }

  // Try button template first; if Meta rejects it, fall back to inline links.
  const bodyText =
    renderMessageWithoutLink({
      message: automation.dmMessage,
      commenterName,
    }) || DEFAULT_LINK_ONLY_TEXT;
  const recipientToken = hashRecipientId(userId);
  const buttons = buildLinkButtons(
    automation.trackedLinks,
    automation.linkButtonLabel,
    recipientToken
  );

  try {
    await sendDirectMessageWithLinkButton({
      context: accessToken,
      instagramAccountId: automation.instagramAccount.instagramId,
      userId: userId,
      text: bodyText,
      buttons: buttons,
    });
  } catch (buttonError) {
    // A closed messaging window rejects the text retry too, so don't let it
    // overwrite the original error with a misleading one.
    if (!isTemplateRejection(buttonError)) throw buttonError;

    console.log(
      `[DM Worker] Button template rejected in ${context}, falling back to inline link:`,
      formatError(buttonError)
    );
    try {
      await sendDirectMessage({
        context: accessToken,
        instagramAccountId: automation.instagramAccount.instagramId,
        userId: userId,
        message: buildInlineLinkFallback(
          automation.dmMessage,
          commenterName,
          automation.trackedLinks,
          bodyText,
          recipientToken
        ),
      });
    } catch (fallbackError) {
      throw classifySendError(fallbackError);
    }
  }
}


// Media attached to an automation's messages (see AutomationMedia).
const MEDIA_INCLUDE = {
  select: { slot: true, kind: true, storageKey: true, position: true },
  orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
};

type SlotMedia = {
  slot: string | null;
  kind: string;
  storageKey: string;
  position: number;
};

/**
 * Send the images/videos of one message slot, after its text. Only ever runs
 * inside an open conversation (Stories/Direct, or after a button tap on a
 * comment flow): Meta documents the private reply to a comment as text only.
 *
 * Best-effort by design: the text (with the link) has already been delivered
 * and must not be retried because of a media problem. Every file is its own
 * Meta call, so the whole batch is reserved on the account's hourly send
 * counter first; when that would go over, no media is sent. Returns a note
 * for the log, or null when everything went out.
 */
async function sendSlotMedia({
  accessToken,
  automation,
  slot,
  userId,
}: {
  accessToken: InstagramContext;
  automation: { media?: SlotMedia[]; instagramAccount: { instagramId: string } };
  slot: "FOLLOW_PROMPT" | "MAIN" | "FOLLOW_UP";
  userId: string;
}): Promise<string | null> {
  const items = (automation.media ?? []).filter((item) => item.slot === slot);
  if (items.length === 0) return null;

  const instagramId = automation.instagramAccount.instagramId;
  if (!(await reserveSendSlots(instagramId, items.length))) {
    return "Media not sent: the account's hourly send limit was reached";
  }

  const failures: string[] = [];
  for (const item of items) {
    try {
      await sendDirectAttachment({
        context: accessToken,
        instagramAccountId: instagramId,
        userId,
        attachment: {
          type: item.kind === "VIDEO" ? "video" : "image",
          url: mediaPublicUrl(item.storageKey),
        },
      });
    } catch (error) {
      failures.push(formatError(error));
    }
  }
  return failures.length
    ? `Media not fully sent (${failures.length}/${items.length} failed): ${failures[0]}`
    : null;
}

/** The automation that already logged this event, for selectAutomation's sticky rule. */
async function findStickyAutomationId(eventId: string, automationIds: string[]): Promise<string | null> {
  if (automationIds.length < 2) return null;
  const existing = await prisma.dmLog.findFirst({
    where: { commentId: eventId, automationId: { in: automationIds } },
    orderBy: { createdAt: "asc" },
    select: { automationId: true },
  });
  return existing?.automationId ?? null;
}

function connectionScope(data: DmQueueJob) {
  return data.accountConnectionId ? { instagramAccountId: data.accountConnectionId } : {};
}

async function processComment(job: Job<ProcessCommentJob>): Promise<void> {
  const {
    instagramAccountId,
    commentId,
    commentText,
    commenterId,
    commenterName,
    mediaId,
    originalMediaId,
  } = job.data;
  const requeueAttempt = job.data.requeueAttempt ?? 0;

  const candidates = await prisma.automation.findMany({
    where: {
      ...connectionScope(job.data),
      type: "COMMENTS",
      // Match campaigns bound to this specific post, plus any-post campaigns.
      // A comment left on an ad carries the ad's own media id, while the
      // campaign is bound to the post the ad was created from, so both ids
      // have to be considered or the comment is dropped without a trace.
      //
      // An automation can be limited to several posts (AutomationPost); the
      // legacy single postId is still matched for rows written by older code.
      OR: [
        { posts: { some: { postId: { in: originalMediaId ? [mediaId, originalMediaId] : [mediaId] } } } },
        { postId: mediaId },
        ...(originalMediaId ? [{ postId: originalMediaId }] : []),
        { matchAnyPost: true },
      ],
      isActive: true,
      // A deactivated account (Accounts tab) answers nothing, and neither
      // does a client that is not ACTIVE (pending, rejected or disabled).
      instagramAccount: {
        instagramId: instagramAccountId,
        automationsEnabled: true,
      },
      workspace: { status: "ACTIVE" },
    },
    include: {
      instagramAccount: true,
      workspace: true,
      posts: { select: { postId: true } },
      trackedLinks: {
        select: {
          slug: true,
          label: true,
          destinationUrl: true,
        },
        orderBy: TRACKED_LINK_ORDER,
      },
      media: MEDIA_INCLUDE,
    },
    orderBy: { createdAt: "asc" },
  });

  // Each comment fires at most ONE automation — DM and public reply alike.
  // Keyword beats no keyword, a specific post beats "any post", then the
  // oldest (lib/automation/select.ts). An automation that already handled this
  // comment keeps it, so retries and pre-deploy logs stay consistent.
  const commentEvent: TriggerEvent = {
    kind: "COMMENT",
    text: commentText,
    mediaId,
    ...(originalMediaId ? { originalMediaId } : {}),
  };
  const selection = selectAutomation(
    candidates.map((a) => Object.assign(a, { postIds: (a.posts ?? []).map((p) => p.postId) })),
    commentEvent,
    { stickyAutomationId: await findStickyAutomationId(commentId, candidates.map((a) => a.id)) }
  );
  const automations = selection ? [selection.automation] : [];

  for (const automation of automations) {
    const matchResult = { matched: true, matchedKeyword: selection?.matchedKeyword ?? null };

    const existingLog = await prisma.dmLog.findUnique({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId,
        },
      },
    });

    if (existingLog?.status === "FAILED" && hasLegacyUnconfirmedDelivery(existingLog.errorMessage)) {
      await prisma.dmLog.update({
        where: { automationId_commentId: { automationId: automation.id, commentId } },
        data: { dmDeliveryUnconfirmed: true },
      });
      existingLog.dmDeliveryUnconfirmed = true;
    }

    const alreadyDmd = existingLog?.status === "SENT";
    const alreadyPublicReplied = Boolean(existingLog?.publicReplySentAt);
    const needsDm = !alreadyDmd && !existingLog?.dmDeliveryUnconfirmed &&
      (existingLog?.attempts ?? 0) < MAX_COMMENT_SEND_ATTEMPTS;

    // Skip only when there is genuinely nothing left to do. A comment whose DM
    // already sent but whose public reply never posted (e.g. it hit a rate
    // limit) must still come back so the public reply can be retried.
    if (existingLog?.status === "SKIPPED_PLAN_LIMIT" || existingLog?.status === "SKIPPED_HUMAN_ACTIVE") continue;
    if (
      !needsDm &&
      (alreadyPublicReplied || existingLog?.publicReplyDeliveryUnconfirmed || !automation.publicReplyEnabled)
    ) {
      continue;
    }

    if (!hasInstagramCredentials(automation.instagramAccount)) {
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        create: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          instagramAccountId: automation.instagramAccountId,
          commenterId,
          commenterName,
          commentText,
          commentId,
          matchedKeyword: matchResult.matchedKeyword,
          status: "FAILED",
          errorMessage: "No Instagram access token available",
        },
        update: {
          status: "FAILED",
          errorMessage: "No Instagram access token available",
        },
      });
      continue;
    }

    let accessToken: InstagramContext;
    try {
      accessToken = await createInstagramContext(
        automation.instagramAccount,
        `${job.id}:${automation.id}`
      );
    } catch {
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        create: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          instagramAccountId: automation.instagramAccountId,
          commenterId,
          commenterName,
          commentText,
          commentId,
          matchedKeyword: matchResult.matchedKeyword,
          status: "FAILED",
          errorMessage: "Failed to decrypt Instagram access token",
        },
        update: {
          status: "FAILED",
          errorMessage: "Failed to decrypt Instagram access token",
        },
      });
      continue;
    }

    await prisma.dmLog.upsert({
      where: { automationId_commentId: { automationId: automation.id, commentId } },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        instagramAccountId: automation.instagramAccountId,
        commenterId, commenterName, commentText, commentId,
        matchedKeyword: matchResult.matchedKeyword,
        status: "PENDING",
      },
      update: {},
    });

    // Public reply leg — decoupled from the DM and posted first so a DM failure
    // (e.g. a non-follower whose messaging is restricted) never suppresses it.
    // Idempotent across retries via publicReplySentAt.
    const replyPool =
      automation.publicReplyMessages.length > 0
        ? automation.publicReplyMessages
        : automation.publicReplyMessage
          ? [automation.publicReplyMessage]
          : [];
    if (
      automation.publicReplyEnabled &&
      replyPool.length > 0 &&
      !existingLog?.publicReplySentAt &&
      !existingLog?.publicReplyDeliveryUnconfirmed &&
      await claimCommentDelivery(automation.id, commentId, "public")
    ) {
      try {
        const chosen = replyPool[Math.floor(Math.random() * replyPool.length)];
        const publicReply = renderMessageWithTracking({
          message: chosen,
          commenterName,
          trackedLinks: automation.trackedLinks,
        });
        await sendCommentReply({
          context: accessToken,
          commentId: commentId,
          message: publicReply,
          postId: mediaId,
        });
        await countSendCalls(instagramAccountId);
        await prisma.dmLog.update({
          where: {
            automationId_commentId: { automationId: automation.id, commentId },
          },
          data: { publicReplySentAt: new Date(), publicReplyError: null, publicReplyDeliveryUnconfirmed: false },
        });
      } catch (error) {
        console.error(
          "[DM Worker] Public comment reply failed:",
          formatError(error)
        );
        await prisma.dmLog
          .update({
            where: {
              automationId_commentId: {
                automationId: automation.id,
                commentId,
              },
            },
            data: { publicReplyError: formatError(classifySendError(error)), publicReplyDeliveryUnconfirmed: !isConfirmedSendRejection(error) },
          })
          .catch(() => {});
      }
    }

    // DM already sent on an earlier pass; the public reply retry above was all
    // this run needed. Don't re-send the DM.
    if (!needsDm) continue;

    // Wait before the DM (dmDelaySeconds). The public reply above went out at
    // once; the DM leg runs again as its own delayed job, so everything below
    // (dedup, plan and hourly limits) and above (the account still on, the
    // automation still active, the client still active) is checked when it is
    // sent, not now. The job id carries the attempt count: a sweep during the
    // wait collapses onto the same job, a retry after a failure gets its own.
    const dmDelaySeconds = automation.dmDelaySeconds ?? 0;
    if (dmDelaySeconds > 0 && !job.data.dmDelayed) {
      await getDMQueue().add(
        "process-comment",
        { ...job.data, dmDelayed: true, dmScheduledAt: new Date().toISOString() },
        {
          delay: dmDelaySeconds * 1000,
          jobId: `dmdelay_${instagramAccountId}_${commentId}_${existingLog?.attempts ?? 0}`,
        }
      );
      continue;
    }
    // Someone from the team answered the person during the wait: the bot
    // stays out of it (final, a later sweep does not send it either).
    if (
      job.data.dmDelayed &&
      job.data.dmScheduledAt &&
      (await humanRepliedSince({
        accountConnectionId: automation.instagramAccountId,
        recipientId: commenterId,
        since: new Date(job.data.dmScheduledAt),
      }))
    ) {
      await prisma.dmLog.update({
        where: { automationId_commentId: { automationId: automation.id, commentId } },
        data: {
          status: "SKIPPED_HUMAN_ACTIVE",
          errorMessage: "Not sent: someone from the account answered this person while the DM was waiting",
        },
      });
      continue;
    }

    // Meta allows exactly ONE private reply per comment, ever — across every
    // campaign. When several campaigns match the same comment (duplicated
    // campaigns, or an any-post campaign overlapping a post-specific one), only
    // the first can deliver; the rest would fail with "The comment is invalid
    // for a private reply". Skip them explicitly instead of burning an API call
    // and logging a failure the user can do nothing about. The public reply
    // above still goes out per campaign — only the DM leg is deduped.
    const privateReplyUsedBy = await prisma.dmLog.findFirst({
      where: {
        commentId,
        status: "SENT",
        automationId: { not: automation.id },
      },
      select: { automation: { select: { name: true } } },
    });
    if (privateReplyUsedBy) {
      await prisma.dmLog.update({
        where: {
          automationId_commentId: { automationId: automation.id, commentId },
        },
        data: {
          status: "SKIPPED_DEDUP",
          matchedKeyword: matchResult.matchedKeyword,
          errorMessage: `Another campaign (${privateReplyUsedBy.automation?.name ?? "unknown"}) already sent the one private reply Instagram allows for this comment`,
        },
      });
      continue;
    }

    const usage = await reserveWorkspaceDMSend(automation.workspaceId);
    if (!usage.allowed) {
      await prisma.dmLog.update({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        data: {
          status: "SKIPPED_PLAN_LIMIT",
          matchedKeyword: matchResult.matchedKeyword,
          errorMessage: `Monthly DM limit reached (${usage.limit})`,
        },
      });
      continue;
    }

    let rateLimit;
    try {
      rateLimit = await reserveDMSlot(instagramAccountId, requeueAttempt);
    } catch (error) {
      await releaseWorkspaceDMReservation(
        automation.workspaceId,
        usage.periodStart
      );
      await prisma.dmLog.update({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        data: {
          status: "FAILED",
          errorMessage: formatError(error),
        },
      });
      throw error;
    }

    if (!rateLimit.allowed) {
      await releaseWorkspaceDMReservation(
        automation.workspaceId,
        usage.periodStart
      );

      if (rateLimit.shouldSkip) {
        await prisma.dmLog.update({
          where: {
            automationId_commentId: {
              automationId: automation.id,
              commentId,
            },
          },
          data: {
            status: "SKIPPED_RATE_LIMIT",
            matchedKeyword: matchResult.matchedKeyword,
            errorMessage: "Hourly Instagram DM rate limit reached",
          },
        });
        continue;
      }

      if (rateLimit.shouldRequeue) {
        await prisma.dmLog.update({
          where: {
            automationId_commentId: {
              automationId: automation.id,
              commentId,
            },
          },
          data: {
            status: "PENDING",
            matchedKeyword: matchResult.matchedKeyword,
            errorMessage: "Hourly rate limit hit; retry scheduled",
          },
        });

        await getDMQueue().add(
          "process-comment",
          {
            ...job.data,
            requeueAttempt: requeueAttempt + 1,
          },
          {
            delay: rateLimit.requeueDelayMs,
            jobId: `comment_${instagramAccountId}_${commentId}_retry_${requeueAttempt + 1}`,
          }
        );
        continue;
      }
    }

    // With an opening DM, the private reply is a button message; tapping it
    // fires a postback that delivers the reveal (see processPostback). Without
    // one, we send the reveal text directly as today.
    const useOpeningDm =
      automation.openingDmEnabled &&
      Boolean(automation.openingDmMessage) &&
      Boolean(automation.openingDmButtonLabel);

    // Follow-gating: the link is revealed only after a follow. When an opening
    // DM is enabled it comes FIRST, and its button routes into the follow check
    // (opening DM → follow gate → link). Without an opening DM, we check follow
    // status at comment time: confirmed followers get the link now, everyone
    // else gets the "follow me first" prompt (re-verified on tap).
    let sendFollowPrompt = false;
    if (automation.requireFollow && !useOpeningDm) {
      const alreadyFollows = await getUserFollowStatus({
        context: accessToken,
        recipientId: commenterId,
      });
      sendFollowPrompt =
        accessToken.provider === "ZERNIO"
          ? alreadyFollows === false
          : alreadyFollows !== true;
    }

    let claimed;
    try {
      claimed = await claimCommentDelivery(automation.id, commentId, "dm");
    } catch (error) {
      if (rateLimit?.reserved) await releaseDMSlot(instagramAccountId);
      await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
      throw error;
    }
    if (!claimed) {
      if (rateLimit?.reserved) await releaseDMSlot(instagramAccountId);
      await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
      continue;
    }
    let delivered = false;
    try {
      if (useOpeningDm) {
        const openingText = renderMessageWithTracking({
          message: automation.openingDmMessage as string,
          commenterName,
          trackedLinks: [],
        });
        await sendPrivateReplyWithButton({
          context: accessToken,
          instagramAccountId: automation.instagramAccount.instagramId,
          commentId: commentId,
          text: openingText,
          buttonTitle: automation.openingDmButtonLabel as string,
          // The ":open" marker tells a tap here apart from the follow prompt's
          // own "I'm following" button, which sends the same prefix.
          payload: `${automation.requireFollow ? "followcheck" : "reveal"}:${automation.id}:open`,
          postId: mediaId,
        });
      } else if (sendFollowPrompt) {
        const promptText = renderMessageWithoutLink({
          message:
            automation.followPromptMessage ||
            DEFAULT_FOLLOW_PROMPT_MESSAGE,
          commenterName,
        });
        await sendPrivateReplyWithButton({
          context: accessToken,
          instagramAccountId: automation.instagramAccount.instagramId,
          commentId: commentId,
          text: promptText,
          buttonTitle: automation.followPromptButtonLabel || DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL,
          payload: `followcheck:${automation.id}`,
          postId: mediaId,
        });
      } else if (automation.trackedLinks.length > 0) {
        // Try button template first; if Meta rejects it, fall back to inline links.
        const bodyText =
          renderMessageWithoutLink({
            message: automation.dmMessage,
            commenterName,
          }) || DEFAULT_LINK_ONLY_TEXT;
        const buttons = buildLinkButtons(
          automation.trackedLinks,
          automation.linkButtonLabel,
          hashRecipientId(commenterId)
        );

        try {
          await sendPrivateReplyWithLinkButton({
            context: accessToken,
            instagramAccountId: automation.instagramAccount.instagramId,
            commentId: commentId,
            text: bodyText,
            buttons: buttons,
            postId: mediaId,
          });
        } catch (buttonError) {
          // Only a template rejection is worth retrying as text. Anything else
          // (closed window, comment already replied to) fails the same way and
          // would replace the real error with a misleading one.
          if (!isTemplateRejection(buttonError)) throw buttonError;

          console.log(
            "[DM Worker] Button template rejected, falling back to inline link:",
            formatError(buttonError)
          );
          const fallbackMessage = buildInlineLinkFallback(
            automation.dmMessage,
            commenterName,
            automation.trackedLinks,
            bodyText,
            hashRecipientId(commenterId)
          );
          try {
            await sendPrivateReply({
              context: accessToken,
              instagramAccountId: automation.instagramAccount.instagramId,
              commentId: commentId,
              message: fallbackMessage,
              postId: mediaId,
            });
          } catch (fallbackError) {
            throw classifySendError(fallbackError);
          }
        }
      } else {
        const dmMessage = renderMessageWithTracking({
          message: automation.dmMessage,
          commenterName,
          trackedLinks: automation.trackedLinks,
          recipientToken: hashRecipientId(commenterId),
        });
        await sendPrivateReply({
          context: accessToken,
          instagramAccountId: automation.instagramAccount.instagramId,
          commentId: commentId,
          message: dmMessage,
          postId: mediaId,
        });
      }

      delivered = true;
      await prisma.dmLog.update({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        data: {
          status: "SENT",
          dmSentAt: new Date(),
          dmDeliveryUnconfirmed: false,
          errorMessage: null,
        },
      });
    } catch (error) {
      const sendError = classifySendError(error);
      // Retain reservations if the provider may have delivered the message.
      if (isConfirmedSendRejection(sendError)) {
        if (rateLimit?.reserved) await releaseDMSlot(instagramAccountId);
        await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
      }
      await prisma.dmLog.update({
        where: { automationId_commentId: { automationId: automation.id, commentId } },
        data: {
          status: delivered ? "SENT" : "FAILED",
          ...(delivered ? { dmSentAt: new Date() } : {}),
          errorMessage: formatError(sendError),
          dmDeliveryUnconfirmed: isDeliveryUnconfirmed(sendError),
        },
      });
      throw sendError;
    }
  }
}

async function sendPostbackOnce({
  operationId,
  send,
}: {
  operationId: string;
  send: () => Promise<unknown>;
}): Promise<boolean> {
  try {
    await prisma.postbackDelivery.create({ data: { id: operationId } });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    )
      return false;
    throw error;
  }
  try {
    await send();
    return true;
  } catch (error) {
    // A durable claim survives queue eviction, concurrent redelivery, and a
    // process crash during delivery. Only confirmed rejections permit retry.
    if (isConfirmedSendRejection(error)) {
      await prisma.postbackDelivery.delete({ where: { id: operationId } });
      throw error;
    }
    throw classifySendError(error);
  }
}

// Tells someone whose "I'm following" tap is being re-checked that it is being
// looked at, so the chat does not sit silent while Instagram catches up with
// the follow. Opt-in through FOLLOW_RECHECK_ACK_MESSAGE, and best-effort: it
// never holds up the re-check, which is already queued when this runs.
async function sendFollowRecheckAck({
  context,
  instagramAccountId,
  automationId,
  userId,
  operationId,
}: {
  context: InstagramContext;
  instagramAccountId: string;
  automationId: string;
  userId: string;
  operationId: string | null;
}): Promise<void> {
  const message = process.env.FOLLOW_RECHECK_ACK_MESSAGE?.trim();
  if (!message) return;
  try {
    // One acknowledgement per re-check cycle: a burst of taps collapses into a
    // single re-check (bucketed job id) and should get a single reply too.
    const first = await getRedisConnection().set(
      `follow_recheck_ack:${automationId}:${userId}`,
      "1",
      "PX",
      FOLLOW_RECHECK_TOTAL_MS,
      "NX"
    );
    if (first !== "OK") return;
    const send = () =>
      sendDirectMessage({ context, instagramAccountId, userId, message });
    // Its own id: the tap's id is claimed later by the link or prompt that
    // the re-check sends, and claiming it here would suppress that message.
    // Without an id the Redis NX above is the only dedupe.
    if (operationId) {
      await sendPostbackOnce({ operationId: `${operationId}:ack`, send });
    } else {
      await send();
    }
    await countSendCalls(instagramAccountId);
  } catch (error) {
    console.log(
      "[DM Worker] Failed to send follow re-check acknowledgement:",
      formatError(error),
    );
  }
}

/**
 * Deliver the reveal message after a user taps an opening DM's button.
 * The postback payload is `reveal:<automationId>`; the sender is the user's
 * IGSID (same id as their comment author id), which we DM directly.
 */
async function processPostback(job: Job<ProcessPostbackJob>): Promise<void> {
  const { instagramAccountId, userId, payload, fallback } = job.data;

  const isFollowCheck = payload.startsWith("followcheck:");
  if (!isFollowCheck && !payload.startsWith("reveal:")) return;
  // The opening DM's button appends ":open" to the payload; the follow
  // prompt's button does not. Automation ids are cuids and contain no colon.
  const [automationId, marker] = payload
    .slice(isFollowCheck ? "followcheck:".length : "reveal:".length)
    .split(":");
  const fromOpeningDm = marker === "open";

  const automation = await prisma.automation.findFirst({
    // Paused automation or deactivated account: button taps and scheduled
    // thank-you messages are dropped too.
    where: {
      id: automationId,
      isActive: true,
      instagramAccount: { automationsEnabled: true },
      workspace: { status: "ACTIVE" },
      ...connectionScope(job.data),
    },
    include: {
      instagramAccount: true,
      workspace: true,
      trackedLinks: {
        select: { slug: true, label: true, destinationUrl: true },
        orderBy: TRACKED_LINK_ORDER,
      },
      media: MEDIA_INCLUDE,
    },
  });

  if (
    !automation ||
    automation.instagramAccount.instagramId !== instagramAccountId ||
    !hasInstagramCredentials(automation.instagramAccount)
  ) {
    return;
  }

  // Duplicate sends are enabled: every button tap re-sends the reveal
  // instead of only firing once per person.
  const dedupeId = `reveal:${userId}`;

  if (fallback) {
    const existingReveal = await prisma.dmLog.findUnique({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId: dedupeId,
        },
      },
    });
    if (
      existingReveal?.status === "SENT" ||
      existingReveal?.dmDeliveryUnconfirmed
    )
      return;
  }

  let accessToken: InstagramContext;
  try {
    accessToken = await createInstagramContext(
      automation.instagramAccount,
      `${job.id}:${automation.id}`,
    );
  } catch {
    return;
  }

  // Personalize {username}. The postback carries only the tapper's IGSID.
  const commenterName = await resolveRecipientName({
    context: accessToken,
    workspaceId: automation.workspaceId,
    recipientId: userId,
  });

  const operationId = createHash("sha256")
    .update(JSON.stringify([
      automation.instagramAccountId,
      automation.id,
      userId,
      job.data.mid ?? job.id ?? payload,
    ]))
    .digest("hex");

  // Follow-gate: before revealing the link, verify the user follows. On a
  // `followcheck:` tap a non-follower gets the prompt again (no quota spent);
  // on a read fallback a non-follower is silently skipped — the gate must not
  // be bypassable by just reading the DM and waiting. On a tap, following or
  // unverifiable (null) falls through and delivers the link — fail-open so a
  // real follower is never trapped.
  if ((isFollowCheck || fallback) && automation.requireFollow) {
    const follows = await getUserFollowStatus({
      context: accessToken,
      recipientId: userId,
    });
    // A read fallback needs a confirmed follow. Instagram only reports follow
    // status once the person has tapped a button (before that it answers
    // "User consent is required", i.e. null), so failing open here handed the
    // link to anyone who read the opening DM and waited, follower or not.
    if (fallback && follows !== true) return;
    if (follows === false) {
      if (fallback) return;

      // A tap on an opening-DM button is not a claim to follow — most people
      // who tap it simply don't follow yet — so they get the follow prompt
      // right away. Only the prompt's own button earns the delayed re-check;
      // holding an opening tap for it left people staring at a silent chat.
      if (!fromOpeningDm) {
        // A `false` on a button tap: give the follow time to register and look
        // again, rather than rejecting someone who just followed.
        //
        // The job id is bucketed by the recheck window, not fixed per user.
        // BullMQ keeps completed jobs (removeOnComplete: count 1000) and silently
        // drops an add whose id is still retained, so a fixed id let a person be
        // re-checked once and then never again — their next false tap did
        // nothing at all, no link and no prompt. Bucketing still collapses a burst
        // of taps into a single re-check, which is what the fixed id was for.
        //
        // Jobs queued before re-checks were counted carry only `followRecheck`,
        // which meant one re-check done.
        const rechecksDone =
          job.data.followRecheckAttempt ?? (job.data.followRecheck ? 1 : 0);
        if (rechecksDone < FOLLOW_RECHECK_DELAYS_MS.length) {
          const delay = FOLLOW_RECHECK_DELAYS_MS[rechecksDone];
          const window = Math.floor(Date.now() / delay);
          await getDMQueue().add(
            POSTBACK_JOB_NAME,
            {
              ...job.data,
              followRecheck: true,
              followRecheckAttempt: rechecksDone + 1,
            },
            {
              delay,
              jobId: `postback_recheck_${automation.id}_${userId}_${rechecksDone + 1}_${window}`,
            }
          );
          if (rechecksDone === 0) {
            await sendFollowRecheckAck({
              context: accessToken,
              instagramAccountId: automation.instagramAccount.instagramId,
              automationId: automation.id,
              userId,
              operationId,
            });
          }
          return;
        }

        // Last `false`: they are genuinely not following. Record it — this
        // branch used to return without writing anything at all, so a gate that
        // turned people away left no trace and its rejection rate could not be
        // measured, only guessed at from complaints.
        await prisma.operationalEvent
          .create({
            data: {
              workspaceId: automation.workspaceId,
              source: "WORKER",
              level: "INFO",
              message: "Follow gate rejected a button tap",
              payload: {
                automationId: automation.id,
                automationName: automation.name,
                userId,
                commenterName,
              },
            },
          })
          .catch(() => {});
      }

      const promptText = renderMessageWithoutLink({
        message:
          automation.followPromptMessage ||
          DEFAULT_FOLLOW_PROMPT_MESSAGE,
        commenterName,
      });
      try {
        const promptDelivered = await sendPostbackOnce({
          operationId,
          send: () =>
            sendDirectMessageWithButton({
              context: accessToken,
              instagramAccountId: automation.instagramAccount.instagramId,
              userId: userId,
              text: promptText,
              buttonTitle:
                automation.followPromptButtonLabel || DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL,
              payload: `followcheck:${automation.id}`,
            }),
        });
        if (promptDelivered) {
          await countSendCalls(automation.instagramAccount.instagramId);
          const note = await sendSlotMedia({ accessToken, automation, slot: "FOLLOW_PROMPT", userId });
          if (note) console.log("[DM Worker] Follow prompt media:", note);
        }
      } catch (error) {
        console.log(
          "[DM Worker] Failed to re-send follow prompt:",
          formatError(error),
        );
      }
      return;
    }
  }

  const usage = await reserveWorkspaceDMSend(automation.workspaceId);
  if (!usage.allowed) {
    await prisma.dmLog.upsert({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId: dedupeId,
        },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        instagramAccountId: automation.instagramAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        status: "SKIPPED_PLAN_LIMIT",
        errorMessage: `Monthly DM limit reached (${usage.limit})`,
      },
      update: { status: "SKIPPED_PLAN_LIMIT" },
    });
    return;
  }

  try {
    const delivered = await sendPostbackOnce({
      operationId,
      send: () =>
        sendRevealDirectMessage({
          accessToken: accessToken,
          automation: automation,
          userId: userId,
          commenterName: commenterName,
          context: "postback",
        }),
    });
    if (!delivered) {
      await releaseWorkspaceDMReservation(
        automation.workspaceId,
        usage.periodStart,
      );
      return;
    }
    // The conversation is open now (the person tapped), so the main message's
    // media can follow the text. It never blocks or retries the text above.
    await countSendCalls(automation.instagramAccount.instagramId);
    const mediaNote = await sendSlotMedia({ accessToken, automation, slot: "MAIN", userId });
    // Optional appreciation follow-up: once the link has been delivered, send a
    // short thank-you. It is scheduled as its own delayed job so it can go out
    // some minutes later (followUpDelayMinutes) rather than immediately. The
    // deterministic job id dedupes repeat button taps to one follow-up per user.
    if (automation.followUpEnabled && automation.followUpMessage?.trim()) {
      const delayMs =
        Math.max(0, automation.followUpDelayMinutes ?? 0) * 60_000;
      await getDMQueue().add(
        FOLLOWUP_JOB_NAME,
        {
          instagramAccountId: automation.instagramAccount.instagramId,
          accountConnectionId: automation.instagramAccountId,
          userId,
          automationId: automation.id,
          commenterName,
        },
        {
          delay: delayMs,
          jobId: `followup_${automation.id}_${userId}`,
        },
      );
    }
    await prisma.dmLog.upsert({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId: dedupeId,
        },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        instagramAccountId: automation.instagramAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        status: "SENT",
        dmSentAt: new Date(),
        errorMessage: mediaNote,
      },
      update: { status: "SENT", dmSentAt: new Date(), errorMessage: mediaNote },
    });
  } catch (originalError) {
    const error = classifySendError(originalError);
    if (isConfirmedSendRejection(error)) await releaseWorkspaceDMReservation(
      automation.workspaceId,
      usage.periodStart,
    );

    // The read fallback is speculative: it only runs when the user read the
    // opening DM and never tapped the button, which means they never messaged
    // us, which means the 24-hour window is closed and Meta rejects the send
    // ("outside of allowed window"). That is the expected outcome here, not a
    // failure the user can act on — so don't log it as FAILED and don't retry
    // it against a window that cannot reopen on its own. It still delivers in
    // the case that does work: the user replied by typing instead of tapping.
    if (fallback && !isDeliveryUnconfirmed(error)) {
      console.log(
        "[DM Worker] Read fallback not delivered (messaging window closed):",
        formatError(error),
      );
      return;
    }

    await prisma.dmLog.upsert({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId: dedupeId,
        },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        instagramAccountId: automation.instagramAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        status: "FAILED",
        errorMessage: formatError(error),
        dmDeliveryUnconfirmed: isDeliveryUnconfirmed(error),
      },
      update: {
        status: "FAILED",
        errorMessage: formatError(error),
        dmDeliveryUnconfirmed: isDeliveryUnconfirmed(error),
      },
    });
    throw error;
  }
}

/**
 * Send the scheduled appreciation follow-up. Runs after its delay elapses.
 * Best-effort: if the message can't be delivered (e.g. the 24-hour messaging
 * window closed because the delay was long), it is logged, not retried forever.
 */
async function processFollowUp(job: Job<ProcessFollowUpJob>): Promise<void> {
  const { instagramAccountId, userId, automationId, commenterName } = job.data;

  const automation = await prisma.automation.findFirst({
    // Paused automation or deactivated account: button taps and scheduled
    // thank-you messages are dropped too.
    where: {
      id: automationId,
      isActive: true,
      instagramAccount: { automationsEnabled: true },
      workspace: { status: "ACTIVE" },
      ...connectionScope(job.data),
    },
    include: { instagramAccount: true, media: MEDIA_INCLUDE },
  });

  if (
    !automation ||
    !automation.followUpEnabled ||
    !automation.followUpMessage?.trim() ||
    automation.instagramAccount.instagramId !== instagramAccountId ||
    !hasInstagramCredentials(automation.instagramAccount)
  ) {
    return;
  }

  let accessToken: InstagramContext;
  try {
    accessToken = await createInstagramContext(
      automation.instagramAccount,
      `${job.id}:${automation.id}`
    );
  } catch {
    return;
  }

  try {
    await sendDirectMessage({
      context: accessToken,
      instagramAccountId: automation.instagramAccount.instagramId,
      userId: userId,
      message: renderMessageWithoutLink({
        message: automation.followUpMessage,
        commenterName: commenterName ?? null,
      }),
    });
    await countSendCalls(automation.instagramAccount.instagramId);
    const note = await sendSlotMedia({ accessToken, automation, slot: "FOLLOW_UP", userId });
    if (note) console.log("[DM Worker] Follow-up media:", note);
  } catch (error) {
    console.log(
      "[DM Worker] Failed to send follow-up message:",
      formatError(error)
    );
  }
}

/**
 * Reply to an inbound message: a DM (DIRECT automations) or a reply to /
 * mention in a story (STORIES automations).
 *
 * The person messaged the account, so the conversation is already open: no
 * opening DM, no public reply; the reveal goes out directly, honouring the
 * follow gate, followed by the slot's media. Each message fires at most one
 * automation (lib/automation/select.ts). Automations without keywords are
 * guarded: one reply per person per cooldown window, and none while a human
 * from the account is talking to that person (lib/automation/guards.ts).
 * Dedup is per inbound message id.
 */
async function processMessage(job: Job<ProcessMessageJob>): Promise<void> {
  const { instagramAccountId, messageId, messageText, senderId } = job.data;
  // Jobs queued before channels existed carry no channel: they were DMs.
  const channel = job.data.channel ?? "DIRECT";
  const requeueAttempt = job.data.requeueAttempt ?? 0;
  const dedupeId = `dm:${messageId}`;

  const candidates = await prisma.automation.findMany({
    where: {
      ...connectionScope(job.data),
      type: channel === "DIRECT" ? "DIRECT" : "STORIES",
      isActive: true,
      // A deactivated account (Accounts tab) answers nothing.
      instagramAccount: { instagramId: instagramAccountId, automationsEnabled: true },
      // A client that is not ACTIVE answers nothing either.
      workspace: { status: "ACTIVE" },
    },
    include: {
      instagramAccount: true,
      workspace: true,
      trackedLinks: {
        select: { slug: true, label: true, destinationUrl: true },
        orderBy: TRACKED_LINK_ORDER,
      },
      media: MEDIA_INCLUDE,
    },
    orderBy: { createdAt: "asc" },
  });

  const selection = selectAutomation(
    candidates,
    { kind: "MESSAGE", channel, text: messageText },
    { stickyAutomationId: await findStickyAutomationId(dedupeId, candidates.map((a) => a.id)) }
  );
  if (!selection) return;
  const automation = selection.automation;

  const existingLog = await prisma.dmLog.findUnique({
    where: { automationId_commentId: { automationId: automation.id, commentId: dedupeId } },
  });

  // Already replied to this message (or deliberately skipped it) — a retry of
  // the job must not send a second DM.
  if (
    existingLog?.status === "SENT" ||
    existingLog?.status === "SKIPPED_PLAN_LIMIT" ||
    existingLog?.status === "SKIPPED_COOLDOWN" ||
    existingLog?.status === "SKIPPED_HUMAN_ACTIVE" ||
    existingLog?.status === "SKIPPED_RATE_LIMIT" ||
    existingLog?.dmDeliveryUnconfirmed
  ) {
    return;
  }

  const logBase = {
    workspaceId: automation.workspaceId,
    automationId: automation.id,
    instagramAccountId: automation.instagramAccountId,
    commenterId: senderId,
    // A mention has no text; keep the log readable.
    commentText: messageText || (channel === "STORY_MENTION" ? "(story mention)" : "(no text)"),
    commentId: dedupeId,
    matchedKeyword: selection.matchedKeyword,
  };
  const writeLog = (data: {
    status: "PENDING" | "SENT" | "FAILED" | "SKIPPED_PLAN_LIMIT" | "SKIPPED_RATE_LIMIT" | "SKIPPED_COOLDOWN" | "SKIPPED_HUMAN_ACTIVE";
    errorMessage?: string | null;
    commenterName?: string | null;
    dmSentAt?: Date;
    attempts?: number;
    dmDeliveryUnconfirmed?: boolean;
  }) =>
    prisma.dmLog.upsert({
      where: { automationId_commentId: { automationId: automation.id, commentId: dedupeId } },
      create: { ...logBase, ...data },
      update: data,
    });

  // Wait before the reply (dmDelaySeconds), as in processComment: the reply
  // runs again as a delayed job, so the account, the automation, the guards
  // below (team talking, cooldown) and the limits are checked when it is sent.
  const dmDelaySeconds = automation.dmDelaySeconds ?? 0;
  if (dmDelaySeconds > 0 && !job.data.dmDelayed) {
    await writeLog({ status: "PENDING" });
    await getDMQueue().add(
      MESSAGE_JOB_NAME,
      { ...job.data, dmDelayed: true, dmScheduledAt: new Date().toISOString() },
      {
        delay: dmDelaySeconds * 1000,
        jobId: `dmdelay_${instagramAccountId}_${Buffer.from(messageId).toString("base64url")}`,
      }
    );
    return;
  }
  // Someone from the team answered during the wait: no automatic reply, with
  // or without a keyword.
  if (
    job.data.dmDelayed &&
    job.data.dmScheduledAt &&
    (await humanRepliedSince({
      accountConnectionId: automation.instagramAccountId,
      recipientId: senderId,
      since: new Date(job.data.dmScheduledAt),
    }))
  ) {
    await writeLog({
      status: "SKIPPED_HUMAN_ACTIVE",
      errorMessage: "Not sent: someone from the account answered this person while the reply was waiting",
    });
    return;
  }

  if (!hasInstagramCredentials(automation.instagramAccount)) {
    await writeLog({ status: "FAILED", errorMessage: "No Instagram access token available" });
    return;
  }

  // Guards for automations that answer any message. The winner being blocked
  // means nobody answers: the next automation in line does not take over.
  let releaseCooldown: (() => Promise<void>) | null = null;
  if (isGuardedAutomation(automation)) {
    if (
      await isHumanConversationActive({
        accountConnectionId: automation.instagramAccountId,
        recipientId: senderId,
      })
    ) {
      await writeLog({
        status: "SKIPPED_HUMAN_ACTIVE",
        errorMessage: "Not sent: someone from the account talked to this person in the last 24 hours",
      });
      return;
    }
    const claim = await claimReplyCooldown({
      automationId: automation.id,
      recipientId: senderId,
      hours: automation.replyCooldownHours,
      excludeEventId: dedupeId,
    });
    if (!claim.allowed) {
      await writeLog({
        status: "SKIPPED_COOLDOWN",
        errorMessage: "Not sent: this automation already answered this person within its reply interval",
      });
      return;
    }
    releaseCooldown = claim.release;
  }

  let accessToken: InstagramContext;
  try {
    accessToken = await createInstagramContext(
      automation.instagramAccount,
      `${job.id}:${automation.id}`
    );
  } catch {
    await releaseCooldown?.();
    await writeLog({ status: "FAILED", errorMessage: "Failed to decrypt Instagram access token" });
    return;
  }

  // Personalize {username}. The messages webhook carries only the sender's
  // IGSID, so the handle is recovered from an earlier send or read live.
  const commenterName = await resolveRecipientName({
    context: accessToken,
    workspaceId: automation.workspaceId,
    recipientId: senderId,
  });

  // Follow gate: anyone not confirmed as a follower gets the prompt instead of
  // the link, with the same `followcheck:` button that re-verifies on tap.
  // `null` (unverifiable) prompts too — this is first contact, exactly like a
  // comment, so it follows processComment's fail-closed rule rather than the
  // postback path's fail-open one.
  let sendFollowPrompt = false;
  if (automation.requireFollow) {
    const follows = await getUserFollowStatus({
      context: accessToken,
      recipientId: senderId,
    });
    sendFollowPrompt =
      accessToken.provider === "ZERNIO" ? follows === false : follows !== true;
  }

  const usage = await reserveWorkspaceDMSend(automation.workspaceId);
  if (!usage.allowed) {
    await releaseCooldown?.();
    await writeLog({ status: "SKIPPED_PLAN_LIMIT", errorMessage: `Monthly DM limit reached (${usage.limit})` });
    return;
  }

  // The reply counts against the account's hourly send cap like any other
  // Meta call; over the cap it is retried later, then skipped.
  const igId = automation.instagramAccount.instagramId;
  const rateLimit = await reserveDMSlot(igId, requeueAttempt);
  if (!rateLimit.allowed) {
    await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
    await releaseCooldown?.();
    if (rateLimit.shouldRequeue) {
      await writeLog({ status: "PENDING", errorMessage: "Hourly rate limit hit; retry scheduled" });
      await getDMQueue().add(
        MESSAGE_JOB_NAME,
        { ...job.data, requeueAttempt: requeueAttempt + 1 },
        {
          delay: rateLimit.requeueDelayMs,
          jobId: `message_${instagramAccountId}_${Buffer.from(messageId).toString("base64url")}_retry_${requeueAttempt + 1}`,
        }
      );
    } else {
      await writeLog({ status: "SKIPPED_RATE_LIMIT", errorMessage: "Hourly Instagram DM rate limit reached" });
    }
    return;
  }

  try {
    let mediaNote: string | null;
    if (sendFollowPrompt) {
      const promptText = renderMessageWithoutLink({
        message:
          automation.followPromptMessage ||
          DEFAULT_FOLLOW_PROMPT_MESSAGE,
        commenterName,
      });
      await sendDirectMessageWithButton({
        context: accessToken,
        instagramAccountId: igId,
        userId: senderId,
        text: promptText,
        buttonTitle: automation.followPromptButtonLabel || DEFAULT_FOLLOW_PROMPT_BUTTON_LABEL,
        payload: `followcheck:${automation.id}`,
      });
      mediaNote = await sendSlotMedia({ accessToken, automation, slot: "FOLLOW_PROMPT", userId: senderId });
    } else {
      await sendRevealDirectMessage({
        accessToken: accessToken,
        automation: automation,
        userId: senderId,
        commenterName: commenterName,
        context: "message trigger",
      });
      mediaNote = await sendSlotMedia({ accessToken, automation, slot: "MAIN", userId: senderId });

      // The link has been delivered, so the appreciation follow-up applies
      // here exactly as it does after a button tap. Not scheduled behind the
      // follow prompt — no link went out yet in that branch.
      if (automation.followUpEnabled && automation.followUpMessage?.trim()) {
        await getDMQueue().add(
          FOLLOWUP_JOB_NAME,
          {
            instagramAccountId: igId,
            accountConnectionId: automation.instagramAccountId,
            userId: senderId,
            automationId: automation.id,
            commenterName,
          },
          {
            delay: Math.max(0, automation.followUpDelayMinutes ?? 0) * 60_000,
            jobId: `followup_${automation.id}_${senderId}`,
          }
        );
      }
    }

    await writeLog({ status: "SENT", commenterName, dmSentAt: new Date(), errorMessage: mediaNote });
  } catch (error) {
    if (isConfirmedSendRejection(classifySendError(error))) {
      if (rateLimit.reserved) await releaseDMSlot(igId);
      await releaseCooldown?.();
    }
    await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);
    await writeLog({
      status: "FAILED",
      commenterName,
      attempts: job.attemptsMade + 1,
      errorMessage: formatError(error),
      dmDeliveryUnconfirmed: isDeliveryUnconfirmed(error),
    });
    throw error;
  }
}

/**
 * An echo of a message the account sent. If the automations did not send it,
 * a person did (Instagram app, Business Suite): no-keyword
 * Stories/Direct automations then stay quiet with that person for 24 hours.
 */
async function processEcho(job: Job<ProcessEchoJob>): Promise<void> {
  const { accountConnectionId, recipientId, messageId } = job.data;
  if (!accountConnectionId) return;
  await handleEcho({ accountConnectionId, recipientId, messageId });
}

async function dispatchJob(job: Job<DmQueueJob>): Promise<void> {
  if (job.name === POSTBACK_JOB_NAME) {
    return processPostback(job as Job<ProcessPostbackJob>);
  }
  if (job.name === FOLLOWUP_JOB_NAME) {
    return processFollowUp(job as Job<ProcessFollowUpJob>);
  }
  if (job.name === MESSAGE_JOB_NAME) {
    return processMessage(job as Job<ProcessMessageJob>);
  }
  if (job.name === ECHO_JOB_NAME) {
    return processEcho(job as Job<ProcessEchoJob>);
  }
  return processComment(job as Job<ProcessCommentJob>);
}

async function processJob(job: Job<DmQueueJob>): Promise<void> {
  try {
    await dispatchJob(job);
  } catch (error) {
    // formatError() takes unknown; isDeliveryUnconfirmed() is a type guard on
    // Error subclasses, but keep using formatError() for a consistent message
    // format across every UnrecoverableError thrown from this worker.
    if (isDeliveryUnconfirmed(error))
      throw new UnrecoverableError(formatError(error));
    throw error;
  }
}

async function recordWorkerFailure(
  job: Job<DmQueueJob> | undefined,
  error: Error
) {
  try {
    const instagramAccountId = job?.data.instagramAccountId;
    const commentId =
      job && "commentId" in job.data ? job.data.commentId : null;
    const account = instagramAccountId
      ? await prisma.instagramAccount.findUnique({
          where: { instagramId: instagramAccountId },
          select: { workspaceId: true },
        })
      : null;

    await prisma.operationalEvent.create({
      data: {
        workspaceId: account?.workspaceId ?? null,
        source: "WORKER",
        level: "ERROR",
        message: `DM worker job ${job?.id ?? "unknown"} failed: ${error.message}`,
        payload: {
          jobId: job?.id ?? null,
          attemptsMade: job?.attemptsMade ?? null,
          instagramAccountId: instagramAccountId ?? null,
          commentId,
        },
      },
    });

    await recordWorkerAlert({
      level: "error",
      message: error.message,
      jobId: job?.id,
      instagramAccountId,
      commentId: commentId ?? undefined,
    });
  } catch (recordError) {
    console.error(
      "[DM Worker] Failed to record worker failure:",
      formatError(recordError)
    );
  }
}

export function createDMWorker(): Worker<DmQueueJob> {
  const worker = new Worker<DmQueueJob>("dm-processing", processJob, {
    connection: getRedisConnection(),
    concurrency: 5,
    settings: {
      backoffStrategy: (attemptsMade: number) =>
        BACKOFF_DELAYS[Math.min(attemptsMade - 1, BACKOFF_DELAYS.length - 1)],
    },
  });

  worker.on("completed", (job) => {
    console.log(`[DM Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[DM Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`,
      err.message
    );
    void recordWorkerFailure(job, err);
  });

  worker.on("error", (err) => {
    console.error("[DM Worker] Worker error:", err.message);
    void prisma.operationalEvent
      .create({
        data: {
          source: "WORKER",
          level: "ERROR",
          message: `DM worker process error: ${err.message}`,
          payload: { name: err.name },
        },
      })
      .catch((recordError) => {
        console.error(
          "[DM Worker] Failed to record worker process error:",
          formatError(recordError)
        );
      });
  });

  return worker;
}
