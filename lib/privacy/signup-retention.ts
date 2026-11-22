import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { removeInstagramAccounts } from "@/lib/instagram/remove-account";
import { REJECTED_RETENTION_DAYS, UNCONFIRMED_SIGNUP_RETENTION_DAYS } from "@/lib/workspace-status";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Delete a workspace and the users that belonged only to it. */
async function deleteWorkspaceAndOwnUsers(workspaceId: string) {
  const members = await prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true } });
  const accounts = await prisma.instagramAccount.findMany({ where: { workspaceId }, select: { id: true } });
  if (accounts.length) await removeInstagramAccounts(workspaceId, accounts.map((a) => a.id));
  await prisma.workspace.delete({ where: { id: workspaceId } });
  for (const { userId } of members) {
    const elsewhere = await prisma.workspaceMember.count({ where: { userId } });
    const owns = await prisma.workspace.count({ where: { ownerId: userId } });
    if (!elsewhere && !owns) await prisma.user.delete({ where: { id: userId } });
  }
}

/**
 * Sign-up retention (LGPD), run by the daily job:
 * - public sign-ups whose e-mail was never confirmed: deleted after 7 days;
 * - rejected clients: personal data deleted 30 days after the decision. Only
 *   the decision survives in the audit log — action, date, reason and the
 *   SHA-256 of the e-mail — and the person can sign up again.
 */
export async function purgeExpiredSignups(now = new Date()) {
  const unconfirmed = await prisma.workspace.findMany({
    where: {
      signupSource: "SELF_SIGNUP",
      status: "PENDING_APPROVAL",
      createdAt: { lt: new Date(now.getTime() - UNCONFIRMED_SIGNUP_RETENTION_DAYS * DAY_MS) },
      owner: { emailVerified: null },
    },
    select: { id: true },
  });
  for (const ws of unconfirmed) await deleteWorkspaceAndOwnUsers(ws.id);

  const rejected = await prisma.workspace.findMany({
    where: { status: "REJECTED", rejectedAt: { lt: new Date(now.getTime() - REJECTED_RETENTION_DAYS * DAY_MS) } },
    select: { id: true },
  });
  for (const ws of rejected) {
    const decision = await prisma.adminAuditLog.findFirst({
      where: { workspaceId: ws.id, action: "client.reject" },
      orderBy: { createdAt: "desc" },
    });
    // Keep only the decision row, without the before/after values; the row
    // already has the date, the reason and the e-mail hash.
    await prisma.$transaction([
      prisma.adminAuditLog.deleteMany({ where: { workspaceId: ws.id, ...(decision ? { id: { not: decision.id } } : {}) } }),
      ...(decision
        ? [
            prisma.adminAuditLog.update({
              where: { id: decision.id },
              data: { workspaceId: null, before: Prisma.DbNull, after: Prisma.DbNull },
            }),
          ]
        : []),
    ]);
    await deleteWorkspaceAndOwnUsers(ws.id);
  }

  return { unconfirmedSignupsDeleted: unconfirmed.length, rejectedClientsDeleted: rejected.length };
}
