import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { deleteMediaFiles, mediaKeysForAccounts } from "@/lib/media/storage";

/**
 * Handles Meta's Data Deletion Request Callback for Instagram users who
 * connected their account and later removed the app / asked for deletion.
 *
 * What is deleted for every matching connected Instagram account:
 * - the InstagramAccount row and, by cascade, its campaigns, send logs,
 *   tracked links, link clicks, uploaded media and conversation activity;
 * - stored webhook payloads that mention the account;
 * - operational log entries tied to the account.
 *
 * The customer's login (e-mail) and workspace are not Meta data and are kept;
 * deleting those is a separate request to support (see /exclusao-dados).
 */

export function hashMetaUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

/** 16 uppercase hex characters, e.g. "9F2C04A1B7D35E60". */
export function generateConfirmationCode(): string {
  return randomBytes(8).toString("hex").toUpperCase();
}

export function isConfirmationCode(value: unknown): value is string {
  return typeof value === "string" && /^[0-9A-F]{16}$/.test(value);
}

export function deletionStatusUrl(confirmationCode: string): string {
  return `${getBaseUrl()}/exclusao-dados?codigo=${encodeURIComponent(confirmationCode)}`;
}

/**
 * Meta may identify the user by the Instagram professional account id
 * (`instagramId`), the app-scoped id (`instagramScopedId`) or — for Unified
 * login — the token's user (`metaLoginUserId`); match all of them. Requests
 * that match nothing are recorded and raise a warning (see runDataDeletion).
 */
export function findAccountsForMetaUser(userId: string) {
  return prisma.instagramAccount.findMany({
    where: {
      OR: [{ instagramId: userId }, { instagramScopedId: userId }, { metaLoginUserId: userId }],
    },
    select: { id: true, instagramId: true, workspaceId: true, username: true },
  });
}

async function deleteInstagramAccountData(account: { id: string; instagramId: string }) {
  const mediaKeys = await mediaKeysForAccounts([account.id]);
  await prisma.$transaction(async (tx) => {
    // JSONB containment (@>): any webhook entry addressed to this account.
    await tx.webhookEvent.deleteMany({
      where: { payload: { path: ["entry"], array_contains: [{ id: account.instagramId }] } },
    });
    await tx.operationalEvent.deleteMany({
      where: { payload: { path: ["instagramAccountId"], equals: account.id } },
    });
    await tx.processedComment.deleteMany({
      where: { instagramAccountId: { in: [account.instagramId, account.id] } },
    });
    await tx.botMessage.deleteMany({ where: { instagramId: account.instagramId } });
    // Cascades to Automation, DmLog, TrackedLink, LinkClick, AutomationMedia
    // and ConversationActivity.
    await tx.instagramAccount.deleteMany({ where: { id: account.id } });
  });
  // Uploaded images/videos of the account's automations.
  await deleteMediaFiles(mediaKeys);
}

/** Runs (or re-runs) one stored request. Never throws. */
export async function runDataDeletion(requestId: string) {
  const request = await prisma.dataDeletionRequest.findUnique({ where: { id: requestId } });
  if (!request?.metaUserId) return request;

  try {
    const accounts = await findAccountsForMetaUser(request.metaUserId);
    for (const account of accounts) {
      await deleteInstagramAccountData(account);
    }

    if (accounts.length === 0) {
      // Either nothing was ever stored for this user, or the id does not match
      // what we store. Surface it so an id mismatch never goes unnoticed.
      await prisma.operationalEvent
        .create({
          data: {
            source: "SYSTEM",
            level: "WARNING",
            message:
              "Meta data deletion request matched no connected Instagram account",
            payload: { confirmationCode: request.confirmationCode },
          },
        })
        .catch(() => {});
    }

    return await prisma.dataDeletionRequest.update({
      where: { id: request.id },
      data: {
        status: accounts.length > 0 ? "COMPLETED" : "NOT_FOUND",
        accountsDeleted: accounts.length,
        completedAt: new Date(),
        metaUserId: null,
        errorMessage: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          message: "Meta data deletion request failed; it will be retried by the daily purge job",
          payload: { confirmationCode: request.confirmationCode, reason: message.slice(0, 300) },
        },
      })
      .catch(() => {});
    return await prisma.dataDeletionRequest.update({
      where: { id: request.id },
      data: { status: "FAILED", errorMessage: message.slice(0, 300) },
    });
  }
}

/** Records the request, deletes the data and returns what Meta expects back. */
export async function handleMetaDataDeletion(userId: string) {
  const confirmationCode = generateConfirmationCode();
  const request = await prisma.dataDeletionRequest.create({
    data: {
      confirmationCode,
      metaUserIdHash: hashMetaUserId(userId),
      metaUserId: userId,
    },
  });
  await runDataDeletion(request.id);
  return { url: deletionStatusUrl(confirmationCode), confirmation_code: confirmationCode };
}

/** Retries requests that failed or were interrupted. Used by the purge cron. */
export async function retryPendingDataDeletions() {
  const pending = await prisma.dataDeletionRequest.findMany({
    where: { status: { in: ["RECEIVED", "FAILED"] }, metaUserId: { not: null } },
    select: { id: true },
    take: 100,
  });
  const results = [];
  for (const { id } of pending) {
    const updated = await runDataDeletion(id);
    results.push(updated?.status ?? "UNKNOWN");
  }
  return results;
}

/**
 * Deauthorize Callback: the user removed the app on Instagram. The token is
 * dead, so it is wiped and the account flagged for reconnection. Campaigns and
 * history are kept until the customer deletes them or Meta sends a data
 * deletion request.
 */
export async function revokeInstagramAccess(userId: string) {
  const accounts = await findAccountsForMetaUser(userId);
  if (accounts.length === 0) return 0;

  await prisma.instagramAccount.updateMany({
    where: { id: { in: accounts.map((a) => a.id) } },
    data: { accessToken: "", tokenInvalidAt: new Date(), webhookSubscribed: false },
  });
  await prisma.operationalEvent.createMany({
    data: accounts.map((account) => ({
      workspaceId: account.workspaceId,
      source: "SYSTEM" as const,
      level: "WARNING" as const,
      message: `@${account.username} removed the app on Instagram; reconnect it to resume sending.`,
      payload: { instagramAccountId: account.id },
    })),
  });
  return accounts.length;
}
