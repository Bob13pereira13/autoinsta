import { NextResponse } from "next/server";
import { auth, getCurrentWorkspaceId } from "@/lib/auth";
import { missingBrandFields } from "@/config/brand";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { prisma } from "@/lib/db/client";
import { getDMQueue } from "@/lib/queue/client";
import { getWorkerAlerts, getWorkerHealth } from "@/lib/ops/worker-health";

export const runtime = "nodejs";

export async function GET() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const session = await auth();
  const isAdmin = isPlatformAdmin(session?.user?.email);
  const workspaceAccounts = await prisma.instagramAccount.findMany({
    where: { workspaceId },
    select: { id: true, instagramId: true },
  });
  const ownAccountIds = new Set(
    workspaceAccounts.flatMap((account) => [account.id, account.instagramId])
  );

  const [
    queueCounts,
    workerHealth,
    allWorkerAlerts,
    webhookFailures,
    dmFailures,
    tokenRefreshFailures,
    operationalEvents,
  ] = await Promise.all([
    getDMQueue().getJobCounts("waiting", "active", "delayed", "failed"),
    getWorkerHealth(),
    getWorkerAlerts(isAdmin ? 10 : 25),
    prisma.webhookEvent.findMany({
      where: { workspaceId, status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        object: true,
        errorMessage: true,
        createdAt: true,
        processedAt: true,
      },
    }),
    prisma.dmLog.findMany({
      where: {
        workspaceId,
        status: {
          in: [
            "FAILED",
            "SKIPPED_RATE_LIMIT",
            "SKIPPED_PLAN_LIMIT",
            "SKIPPED_NO_MATCH",
          ],
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        commentId: true,
        commentText: true,
        errorMessage: true,
        updatedAt: true,
        automation: { select: { name: true } },
      },
    }),
    prisma.operationalEvent.findMany({
      where: { workspaceId, source: "TOKEN_REFRESH", level: "ERROR" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        message: true,
        createdAt: true,
        payload: true,
      },
    }),
    prisma.operationalEvent.findMany({
      // Events without a workspace are platform-wide: operator only.
      where: isAdmin ? { OR: [{ workspaceId }, { workspaceId: null }] } : { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        source: true,
        level: true,
        message: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
  ]);

  // Worker alerts live in one global Redis list; customers only see their own.
  const workerAlerts = isAdmin
    ? allWorkerAlerts
    : allWorkerAlerts
        .filter((alert) => alert.instagramAccountId && ownAccountIds.has(alert.instagramAccountId))
        .slice(0, 10);

  return NextResponse.json({
    success: true,
    data: {
      isAdmin,
      brandMissingFields: isAdmin ? missingBrandFields() : [],
      queueCounts,
      workerHealth,
      workerAlerts,
      webhookFailures,
      dmFailures,
      tokenRefreshFailures,
      operationalEvents,
    },
  });
}
