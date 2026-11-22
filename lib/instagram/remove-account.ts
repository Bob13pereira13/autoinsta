import { prisma } from "@/lib/db/client";
import { deleteMediaFiles, mediaKeysForAccounts } from "@/lib/media/storage";

/**
 * Remove connected Instagram accounts of a workspace for good: the account,
 * its token and, by cascade, its automations, send history and tracked links;
 * then the uploaded media files of those automations and the bot-message
 * bookkeeping. Returns how many accounts were removed (ids of other
 * workspaces are ignored).
 */
export async function removeInstagramAccounts(workspaceId: string, instagramAccountIds: string[]): Promise<number> {
  if (instagramAccountIds.length === 0) return 0;
  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId, id: { in: instagramAccountIds } },
    select: { id: true, instagramId: true },
  });
  if (accounts.length === 0) return 0;
  const mediaKeys = await mediaKeysForAccounts(accounts.map((a) => a.id));

  await prisma.instagramAccount.deleteMany({
    where: { id: { in: accounts.map((a) => a.id) }, workspaceId },
  });
  await prisma.botMessage.deleteMany({
    where: { instagramId: { in: accounts.map((a) => a.instagramId) } },
  });
  await deleteMediaFiles(mediaKeys);
  return accounts.length;
}
