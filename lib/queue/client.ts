/**
 * BullMQ Queue Client
 *
 * Provides the DM processing queue and Redis connection for BullMQ.
 */

import { Queue } from "bullmq";
import Redis from "ioredis";
import { QUEUE_RETENTION } from "@/lib/privacy/retention";

let connection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null, // Required by BullMQ
    });
  }
  return connection;
}

// ─── DM Queue ───────────────────────────────────────────────────────────────────

export type CommentSource = "WEBHOOK" | "POLLING";

export interface ProcessCommentJob {
  accountConnectionId?: string;
  instagramAccountId: string;
  commentId: string;
  commentText: string;
  commenterId: string;
  commenterName?: string;
  mediaId: string;
  // Set when the comment came from an ad: the organic post the ad was made
  // from. Campaigns are bound to that post, so both ids have to be matched.
  originalMediaId?: string;
  requeueAttempt?: number;
  // The delayed pass (Automation.dmDelaySeconds): nothing went out before it.
  // It checks everything again, then sends the public reply and the DM.
  // `dmScheduledAt` is when the wait started (ISO), for the team-reply check.
  dmDelayed?: boolean;
  dmScheduledAt?: string;
  // Which path enqueued this comment. It is not copied to ProcessedComment or
  // used for reconciliation dedup.
  source?: CommentSource;
}

// Delivered when a user taps an opening DM's button — carries the reveal target.
export interface ProcessPostbackJob {
  accountConnectionId?: string;
  instagramAccountId: string;
  userId: string;
  payload: string;
  mid?: string;
  /**
   * Set on the "read fallback" jobs older versions queued when someone read
   * an opening DM without tapping it. Nothing is sent for a read any more:
   * such a job still in the queue is dropped.
   */
  fallback?: boolean;
  // Set on the delayed second pass of a follow-gate check. Instagram does not
  // report a brand-new follow immediately, so the first `false` is re-checked
  // later instead of rejecting the tap outright.
  followRecheck?: boolean;
  // How many delayed re-checks have run, counting this one. Absent on jobs
  // queued before re-checks were counted, where `followRecheck` meant one.
  followRecheckAttempt?: number;
}

// Scheduled after the link is delivered, to send the appreciation follow-up.
// Enqueued with a delay (followUpDelayMinutes) so it can fire later, not just
// immediately.
export interface ProcessFollowUpJob {
  accountConnectionId?: string;
  instagramAccountId: string;
  userId: string;
  automationId: string;
  commenterName?: string | null;
}

// An inbound message: a DM (DIRECT automations) or a story reply / mention
// (STORIES automations). Jobs queued before channels existed have no
// `channel` and are treated as DIRECT.
export interface ProcessMessageJob {
  accountConnectionId?: string;
  instagramAccountId: string;
  messageId: string;
  messageText: string;
  senderId: string;
  channel?: "DIRECT" | "STORY_REPLY" | "STORY_MENTION";
  storyId?: string;
  requeueAttempt?: number;
  // The delayed pass of the reply (Automation.dmDelaySeconds); see
  // ProcessCommentJob.
  dmDelayed?: boolean;
  dmScheduledAt?: string;
}

// A message the account itself sent (echo). Checked against the bot's own
// message ids to detect a person replying from the Instagram app.
export interface ProcessEchoJob {
  accountConnectionId?: string;
  instagramAccountId: string;
  recipientId: string;
  messageId: string;
  echo: true;
}

export type DmQueueJob =
  | ProcessCommentJob
  | ProcessPostbackJob
  | ProcessFollowUpJob
  | ProcessMessageJob
  | ProcessEchoJob;

export const POSTBACK_JOB_NAME = "process-postback";
export const FOLLOWUP_JOB_NAME = "process-followup";
export const MESSAGE_JOB_NAME = "process-message";
export const ECHO_JOB_NAME = "process-echo";

let dmQueue: Queue<DmQueueJob> | null = null;

export function getDMQueue(): Queue<DmQueueJob> {
  if (!dmQueue) {
    dmQueue = new Queue<DmQueueJob>("dm-processing", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        // Finished jobs (they carry the comment or message) stay at most 24 h,
        // and at most the last 1000: the Privacy Policy states this period.
        removeOnComplete: { age: QUEUE_RETENTION.finishedJobHours * 60 * 60, count: QUEUE_RETENTION.finishedJobCount },
        // Clear failed jobs shortly after they exhaust retries. Job ids are
        // deterministic (comment_<acct>_<id>), so a retained failed job would
        // block the polling reconciler from ever retrying that comment. Clearing
        // them lets a later sweep re-enqueue and try again once a transient
        // failure (e.g. an Instagram rate-limit window) has passed. Failure
        // detail is still preserved in DmLog.
        removeOnFail: { age: QUEUE_RETENTION.failedJobMinutes * 60, count: 2000 },
        attempts: 3,
        backoff: {
          type: "custom",
        },
      },
    });
  }
  return dmQueue;
}
