import { decryptToken } from "@/lib/meta/oauth";
import { prisma } from "@/lib/db/client";

export type InstagramContext =
  | {
      provider: "META";
      accessToken: string;
      instagramId: string;
    }
  | {
      provider: "ZERNIO";
      apiKey: string;
      accountId: string;
      instagramId: string;
      operationId?: string;
    };

export type ProviderAccount = {
  provider: "META" | "ZERNIO";
  metaLogin: "INSTAGRAM" | "UNIFIED";
  workspaceId: string;
  zernioAccountId: string | null;
  instagramId: string;
  accessToken: string;
};

/** The account was connected through a login the app no longer supports. */
export class ReconnectRequiredError extends Error {
  constructor() {
    super("This Instagram account was connected through the Facebook login and has to be connected again with Instagram");
    this.name = "ReconnectRequiredError";
  }
}

export function hasInstagramCredentials(
  account: Pick<ProviderAccount, "provider" | "accessToken" | "zernioAccountId">
) {
  return account.provider === "ZERNIO"
    ? Boolean(account.zernioAccountId)
    : Boolean(account.accessToken);
}

export async function createInstagramContext(
  account: ProviderAccount,
  operationId?: string
): Promise<InstagramContext> {
  if (account.provider !== "ZERNIO") {
    // A token from the Facebook (Unified) login, which the app no longer
    // uses: it only worked on graph.facebook.com. The account has to be
    // connected again with Instagram (marked for it by migration).
    if (account.metaLogin === "UNIFIED") throw new ReconnectRequiredError();
    return {
      provider: "META",
      accessToken: decryptToken(account.accessToken),
      instagramId: account.instagramId,
    };
  }
  if (!account.zernioAccountId)
    throw new Error("Zernio account is not connected");
  const connection = await prisma.zernioConnection.findUnique({
    where: { workspaceId: account.workspaceId },
    select: { apiKey: true },
  });
  if (!connection) throw new Error("Zernio workspace connection is missing");
  return {
    provider: "ZERNIO",
    apiKey: decryptToken(connection.apiKey),
    accountId: account.zernioAccountId,
    instagramId: account.instagramId,
    ...(operationId ? { operationId } : {}),
  };
}

export type ZernioContext = Extract<InstagramContext, { provider: "ZERNIO" }>;
