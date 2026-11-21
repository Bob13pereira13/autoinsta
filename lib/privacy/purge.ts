import { prisma } from "@/lib/db/client";
import { retryPendingDataDeletions } from "@/lib/privacy/data-deletion";
import { RETENTION_DAYS, retentionCutoff } from "@/lib/privacy/retention";
import { purgeStaleMedia } from "@/lib/media/storage";

/** Daily retention job: enforces the periods published in /privacidade. */
export async function purgeExpiredData(now = new Date()) {
  const [webhookEvents, operationalEvents, deletionRequests] = await Promise.all([
    prisma.webhookEvent.deleteMany({
      where: { createdAt: { lt: retentionCutoff(RETENTION_DAYS.webhookEvents, now) } },
    }),
    prisma.operationalEvent.deleteMany({
      where: { createdAt: { lt: retentionCutoff(RETENTION_DAYS.operationalEvents, now) } },
    }),
    prisma.dataDeletionRequest.deleteMany({
      where: {
        status: { in: ["COMPLETED", "NOT_FOUND"] },
        requestedAt: { lt: retentionCutoff(RETENTION_DAYS.deletionRequests, now) },
      },
    }),
  ]);

  const retriedDeletions = await retryPendingDataDeletions();

  // Bookkeeping that only matters for a short while: the bot's message ids
  // (to tell its echoes from a person's) and the human-activity markers
  // (a 24h pause).
  const [botMessages, conversationActivity] = await Promise.all([
    prisma.botMessage.deleteMany({
      where: { createdAt: { lt: retentionCutoff(RETENTION_DAYS.botMessages, now) } },
    }),
    prisma.conversationActivity.deleteMany({
      where: { lastHumanMessageAt: { lt: retentionCutoff(RETENTION_DAYS.humanActivity, now) } },
    }),
  ]);
  const media = await purgeStaleMedia(now);

  return {
    botMessagesDeleted: botMessages.count,
    humanActivityDeleted: conversationActivity.count,
    unattachedMediaDeleted: media.unattached,
    orphanMediaFilesDeleted: media.orphanFiles,
    webhookEventsDeleted: webhookEvents.count,
    operationalEventsDeleted: operationalEvents.count,
    deletionRequestsDeleted: deletionRequests.count,
    retriedDeletions,
  };
}
