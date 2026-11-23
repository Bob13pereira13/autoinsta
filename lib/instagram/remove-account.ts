import { prisma } from "@/lib/db/client";
import { deleteInstagramAccountData } from "@/lib/privacy/data-deletion";

/**
 * Remove connected Instagram accounts of a workspace for good (the trash
 * button in Accounts, the admin area, rejected sign-ups): the same deletion as
 * Meta's data deletion callback (lib/privacy/data-deletion.ts), so the account,
 * its token, its automations with their media, send logs, links and clicks,
 * and the Meta notifications and logs that mention it are gone. Returns how
 * many accounts were removed (ids of other workspaces are ignored).
 */
export async function removeInstagramAccounts(workspaceId: string, instagramAccountIds: string[]): Promise<number> {
  if (instagramAccountIds.length === 0) return 0;
  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId, id: { in: instagramAccountIds } },
    select: { id: true, instagramId: true },
  });
  for (const account of accounts) await deleteInstagramAccountData(account);
  return accounts.length;
}
