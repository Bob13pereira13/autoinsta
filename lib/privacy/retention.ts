/**
 * Retention periods. The Privacy Policy (/privacidade) reads these constants,
 * so the published policy and the purge job (/api/cron/purge-data) can never
 * disagree.
 */
export const RETENTION_DAYS = {
  /** Raw webhook payloads from Meta (comment text, usernames, DMs). */
  webhookEvents: 30,
  /** Operational and error logs. */
  operationalEvents: 90,
  /** Finished data deletion requests (only the hashed id and status remain). */
  deletionRequests: 365,
  /** Ids of messages the automations sent (to tell their echoes from a person's). */
  botMessages: 7,
  /** "A person from the account talked to X" markers (the pause lasts 24h). */
  humanActivity: 7,
} as const;

/** Short-lived data in the processing queue (Redis), also in the policy. */
export const QUEUE_RETENTION = {
  /** A finished job (it carries the comment or message) is kept at most this long. */
  finishedJobHours: 24,
  /** At most this many finished jobs are kept at all. */
  finishedJobCount: 1000,
  /** A failed job, after its last retry. */
  failedJobMinutes: 5,
  /** A note that the account sent a message, while a delayed reply waits. */
  echoNoteMinutes: 15,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionCutoff(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
