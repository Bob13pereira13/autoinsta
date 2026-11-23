import { prisma } from "@/lib/db/client";
import { decryptToken, encryptToken } from "@/lib/meta/oauth";
import {
  MetaApiError,
  refreshLongLivedToken,
  TokenExpiredError,
} from "@/lib/meta/client";

/**
 * Long-lived Instagram tokens last 60 days and can be refreshed once they are
 * at least 24 hours old. We refresh at day 45 — i.e. when 15 days or fewer are
 * left — from a job that runs DAILY.
 *
 * Running the job every day (instead of once every 45 days) is deliberate: a
 * single failed run (Meta outage, deploy, network) is then retried on each of
 * the next 14 days before the token expires, instead of silently letting every
 * automation of that account stop.
 */
export const TOKEN_LIFETIME_DAYS = 60;
export const REFRESH_AT_AGE_DAYS = 45;
export const REFRESH_WINDOW_DAYS = TOKEN_LIFETIME_DAYS - REFRESH_AT_AGE_DAYS;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tokens expiring at or before this instant are due for a refresh. */
export function refreshCutoff(now: Date): Date {
  return new Date(now.getTime() + REFRESH_WINDOW_DAYS * DAY_MS);
}

export function isDueForRefresh(tokenExpiresAt: Date | null, now: Date): boolean {
  return tokenExpiresAt !== null && tokenExpiresAt <= refreshCutoff(now);
}

/** Meta answered that the token itself is no longer valid (code 190). */
export function isInvalidTokenError(error: unknown): boolean {
  return (
    error instanceof TokenExpiredError ||
    (error instanceof MetaApiError && error.code === 190)
  );
}

export type TokenRefreshResult = {
  instagramAccountId: string;
  username: string;
  status: "refreshed" | "failed" | "invalid";
  error?: string;
};

export async function refreshExpiringTokens(
  now = new Date()
): Promise<TokenRefreshResult[]> {
  const accounts = await prisma.instagramAccount.findMany({
    where: {
      accessToken: { not: "" },
      provider: "META",
      // Accounts connected through the old Facebook (Unified) login have no
      // Instagram token to renew; they must connect again with Instagram.
      metaLogin: "INSTAGRAM",
      tokenInvalidAt: null,
      tokenExpiresAt: { not: null, lte: refreshCutoff(now) },
    },
    select: { id: true, workspaceId: true, username: true, accessToken: true },
  });

  const results: TokenRefreshResult[] = [];

  for (const account of accounts) {
    try {
      const { accessToken, expiresIn } = await refreshLongLivedToken(
        decryptToken(account.accessToken)
      );
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encryptToken(accessToken),
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          tokenInvalidAt: null,
        },
      });
      results.push({ instagramAccountId: account.id, username: account.username, status: "refreshed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const invalid = isInvalidTokenError(err);

      if (invalid) {
        // Retrying cannot fix a revoked or expired token: only the account
        // owner reconnecting can. Flag it so Settings asks for a reconnect.
        await prisma.instagramAccount.update({
          where: { id: account.id },
          data: { tokenInvalidAt: now },
        });
      }

      await prisma.operationalEvent.create({
        data: {
          workspaceId: account.workspaceId,
          source: "TOKEN_REFRESH",
          level: "ERROR",
          message: invalid
            ? `Instagram token for @${account.username} is no longer valid; the account must be reconnected: ${message}`
            : `Token refresh failed for @${account.username} (will retry on the next daily run): ${message}`,
          payload: { instagramAccountId: account.id, username: account.username },
        },
      });

      results.push({
        instagramAccountId: account.id,
        username: account.username,
        status: invalid ? "invalid" : "failed",
        error: message,
      });
    }
  }

  return results;
}
