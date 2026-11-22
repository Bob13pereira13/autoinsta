import { missingBrandFields } from "@/config/brand";
import { prisma } from "@/lib/db/client";
import { getWorkerAlerts, getWorkerHealth, type WorkerAlert } from "@/lib/ops/worker-health";
import { getDMQueue } from "@/lib/queue/client";

/**
 * Production diagnostics for the operators (admin area only): worker health,
 * queues, worker alerts, failed webhooks, DM failures and skips, token refresh
 * failures and the operational timeline — across every client, or only one
 * (`workspaceId`). Each item says which client it belongs to. Events that
 * belong to no client (platform-wide) only show without the filter.
 */

const DM_PROBLEMS = ["FAILED", "SKIPPED_RATE_LIMIT", "SKIPPED_PLAN_LIMIT", "SKIPPED_NO_MATCH"] as const;
const clientSelect = { select: { id: true, name: true, companyName: true } } as const;

export type DiagnosticsClient = { id: string; name: string };

function clientOf(workspace: { id: string; name: string; companyName: string | null } | null): DiagnosticsClient | null {
  return workspace ? { id: workspace.id, name: workspace.companyName ?? workspace.name } : null;
}

export async function getDiagnostics({ workspaceId }: { workspaceId?: string | null } = {}) {
  const filter = workspaceId?.trim() || null;
  const byClient = filter ? { workspaceId: filter } : {};

  const [queueCounts, workerHealth, rawAlerts, webhookFailures, dmFailures, tokenRefreshFailures, operationalEvents, clients] =
    await Promise.all([
      getDMQueue().getJobCounts("waiting", "active", "delayed", "failed"),
      getWorkerHealth(),
      getWorkerAlerts(filter ? 100 : 25),
      prisma.webhookEvent.findMany({
        where: { status: "FAILED", ...byClient },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, object: true, errorMessage: true, createdAt: true, processedAt: true, workspace: clientSelect },
      }),
      prisma.dmLog.findMany({
        where: { status: { in: [...DM_PROBLEMS] }, ...byClient },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          commentId: true,
          commentText: true,
          errorMessage: true,
          updatedAt: true,
          automation: { select: { name: true } },
          workspace: clientSelect,
        },
      }),
      prisma.operationalEvent.findMany({
        where: { source: "TOKEN_REFRESH", level: "ERROR", ...byClient },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, message: true, createdAt: true, workspace: clientSelect },
      }),
      prisma.operationalEvent.findMany({
        where: byClient,
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, source: true, level: true, message: true, createdAt: true, resolvedAt: true, workspace: clientSelect },
      }),
      prisma.workspace.findMany({
        orderBy: [{ companyName: "asc" }, { name: "asc" }],
        select: { id: true, name: true, companyName: true },
      }),
    ]);

  // Worker alerts live in one Redis list and name the Instagram account (its
  // internal id or its Instagram id); map each to its client.
  const accountRefs = Array.from(new Set(rawAlerts.map((a) => a.instagramAccountId).filter((v): v is string => Boolean(v))));
  const accounts = accountRefs.length
    ? await prisma.instagramAccount.findMany({
        where: { OR: [{ id: { in: accountRefs } }, { instagramId: { in: accountRefs } }] },
        select: { id: true, instagramId: true, workspace: clientSelect },
      })
    : [];
  const clientByAccount = new Map<string, DiagnosticsClient | null>();
  for (const account of accounts) {
    const client = clientOf(account.workspace);
    clientByAccount.set(account.id, client);
    clientByAccount.set(account.instagramId, client);
  }
  const workerAlerts: Array<WorkerAlert & { client: DiagnosticsClient | null }> = rawAlerts
    .map((alert) => ({ ...alert, client: alert.instagramAccountId ? clientByAccount.get(alert.instagramAccountId) ?? null : null }))
    .filter((alert) => !filter || alert.client?.id === filter)
    .slice(0, 25);

  const withClient = <T extends { workspace: { id: string; name: string; companyName: string | null } | null }>(rows: T[]) =>
    rows.map(({ workspace, ...rest }) => ({ ...rest, client: clientOf(workspace) }));

  return {
    filter,
    clients: clients.map((c) => clientOf(c)!),
    brandMissingFields: missingBrandFields(),
    queueCounts,
    workerHealth,
    workerAlerts,
    webhookFailures: withClient(webhookFailures),
    dmFailures: withClient(dmFailures),
    tokenRefreshFailures: withClient(tokenRefreshFailures),
    operationalEvents: withClient(operationalEvents),
  };
}

export type Diagnostics = Awaited<ReturnType<typeof getDiagnostics>>;
