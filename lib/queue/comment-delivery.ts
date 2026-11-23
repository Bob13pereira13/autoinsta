import { prisma } from "@/lib/db/client";

export const MAX_COMMENT_SEND_ATTEMPTS = 3;

/**
 * After these, nothing more goes to the comment: neither the public reply nor
 * the DM. The worker stops on them and the sweep counts the comment handled.
 * - SKIPPED_PLAN_LIMIT: the client's monthly limit.
 * - SKIPPED_HUMAN_ACTIVE: someone from the team answered the person in the
 *   Direct during the wait.
 * - SKIPPED_COMMENT_DELETED: the comment was deleted or hidden during the wait.
 */
/**
 * Why the public reply was deliberately not posted (DmLog.publicReplySkipReason),
 * after the wait: the account had already replied to the comment, the comment
 * was deleted or hidden, or the team answered the person in the Direct.
 */
export type PublicReplySkipReason = "account_replied" | "comment_deleted" | "comment_hidden" | "team_answered";

export const COMMENT_FINAL_SKIPS: readonly string[] = [
  "SKIPPED_PLAN_LIMIT",
  "SKIPPED_HUMAN_ACTIVE",
  "SKIPPED_COMMENT_DELETED",
];

/**
 * The delayed job of a comment (Automation.dmDelaySeconds). The attempt count
 * is in it: a repeated webhook or a sweep during the wait lands on the same
 * job, a retry after a failed DM gets its own.
 */
export function delayedCommentJobId(instagramAccountId: string, commentId: string, attempts: number): string {
  return `dmdelay_${instagramAccountId}_${commentId}_${attempts}`;
}

// A durable, atomic claim precedes the external side effect. If the process
// crashes or the final log write fails, an uncertain send must not be repeated.
export async function claimCommentDelivery(
  automationId: string,
  commentId: string,
  leg: "dm" | "public",
): Promise<boolean> {
  const result = await prisma.dmLog.updateMany({
    where: {
      automationId,
      commentId,
      ...(leg === "dm"
        ? {
            status: { not: "SENT" as const },
            dmDeliveryUnconfirmed: false,
            attempts: { lt: MAX_COMMENT_SEND_ATTEMPTS },
          }
        : { publicReplySentAt: null, publicReplySkipReason: null, publicReplyDeliveryUnconfirmed: false }),
    },
    data:
      leg === "dm"
        ? {
            dmDeliveryUnconfirmed: true,
            attempts: { increment: 1 },
            status: "PENDING",
            errorMessage: null,
          }
        : { publicReplyDeliveryUnconfirmed: true },
  });
  return result.count === 1;
}
