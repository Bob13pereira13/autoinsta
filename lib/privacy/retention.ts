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
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionCutoff(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
