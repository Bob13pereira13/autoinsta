import { prisma } from "@/lib/db/client";
import { retryPendingDataDeletions } from "@/lib/privacy/data-deletion";
import { RETENTION_DAYS, retentionCutoff } from "@/lib/privacy/retention";

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

  return {
    webhookEventsDeleted: webhookEvents.count,
    operationalEventsDeleted: operationalEvents.count,
    deletionRequestsDeleted: deletionRequests.count,
    retriedDeletions,
  };
}
