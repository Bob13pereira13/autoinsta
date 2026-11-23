import { prisma } from "@/lib/db/client";
import { AdminError } from "@/lib/admin/clients";
import { withAdmin } from "@/lib/admin/http";
import { decryptToken } from "@/lib/meta/oauth";
import { subscribeAndCheckWebhooks } from "@/lib/instagram/webhook-check";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; accountId: string }> };

/**
 * "Check notifications": subscribes the account again and answers what Meta
 * confirms (the fields of this app on the account), or Meta's error. The same
 * result goes to Diagnostics.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id, accountId } = await params;
  return withAdmin(async () => {
    const account = await prisma.instagramAccount.findFirst({
      where: { id: accountId, workspaceId: id },
      select: { id: true, instagramId: true, username: true, accessToken: true, metaLogin: true, provider: true },
    });
    if (!account) throw new AdminError("Instagram account not found", 404);
    if (account.provider !== "META" || !account.accessToken) throw new AdminError("This account does not use Meta's official login");
    let accessToken: string;
    try {
      accessToken = decryptToken(account.accessToken);
    } catch {
      throw new AdminError("The account's access could not be read. Reconnect the account.");
    }
    const check = await subscribeAndCheckWebhooks({
      instagramId: account.instagramId,
      username: account.username,
      auth: { accessToken, unifiedLogin: account.metaLogin === "UNIFIED" },
      workspaceId: id,
    });
    await prisma.instagramAccount.update({ where: { id: account.id }, data: { webhookSubscribed: check.subscribed === true } });
    return check;
  });
}
