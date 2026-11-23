import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { effectiveAccountLimit, getDefaultAccountLimit } from "@/lib/account-limit";
import { getBaseUrl, isUnifiedLogin, requireMetaAppId, requireSecret } from "@/lib/env";
import { canConnectInstagramAccount } from "@/lib/instagram-accounts";
import {
  getAssignedInstagramAccounts,
  getLongLivedToken,
  getUnifiedTokenInfo,
  getUserInfo,
  NoInstagramAccountError,
  type UnifiedTokenInfo,
} from "@/lib/meta/client";
import {
  encryptToken,
  exchangeCodeForToken,
  verifyOAuthState,
} from "@/lib/meta/oauth";
import { missingPermissions } from "@/lib/meta/permissions";
import { MissingPermissionError, requiring } from "@/lib/meta/permission-errors";
import { subscribeAndCheckWebhooks } from "@/lib/instagram/webhook-check";
import { canManageWorkspace } from "@/lib/workspace-access";

/**
 * Where Meta's login comes back. Every outcome ends on the Accounts tab with a
 * code the page explains (components/instagram-connect-notice.tsx), and the
 * person can try again from there; nothing here answers with an error page.
 *   denied              the person cancelled the login
 *   missing_permissions Meta refused an essential call for lack of a permission
 *                       (code 10 or 200–299; &missing= names that call's permission)
 *   no_account          no Instagram professional account came with the login
 *   invalid             the login link was missing or older than 10 minutes
 *   forbidden           not allowed to connect accounts in this workspace
 *   limit               the client's account limit (&max=, &connected=)
 *   already_connected   the account belongs to another workspace
 *   failed              anything else (the detail goes to the admin's Diagnostics)
 *   connected           done (&webhooks=off if Meta refused the notifications)
 */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl();
  const back = (query: string) => NextResponse.redirect(`${baseUrl}/accounts?${query}`);
  try {
    return await handleCallback(request, baseUrl, back);
  } catch (err) {
    console.error("[Instagram Callback] Unexpected error:", err);
    return back("instagram=failed");
  }
}

async function handleCallback(request: NextRequest, baseUrl: string, back: (query: string) => NextResponse) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = verifyOAuthState(params.get("state"));

  // Cancel on Meta's dialog: error=access_denied (error_reason=user_denied).
  if (params.get("error")) return back("instagram=denied");
  if (!code || !state) return back("instagram=invalid");

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: state.workspaceId,
      userId: session.user.id,
    },
  });

  if (!membership || !canManageWorkspace(membership.role)) {
    return back("instagram=forbidden");
  }

  // Only ACTIVE clients connect accounts, up to the limit in effect (the
  // client's own or the platform default; null = no limit).
  const workspace = await prisma.workspace.findUnique({
    where: { id: state.workspaceId },
    select: { status: true, instagramAccountLimit: true },
  });
  if (!workspace || workspace.status !== "ACTIVE") {
    return back("instagram=forbidden");
  }
  const accountLimit = effectiveAccountLimit(workspace.instagramAccountLimit, await getDefaultAccountLimit());

  try {
    const redirectUri = `${baseUrl}/api/instagram/callback`;
    const unifiedLogin = isUnifiedLogin();
    const { accessToken: codeToken } = await exchangeCodeForToken(
      code,
      redirectUri
    );

    let accessToken: string;
    let tokenExpiresAt: Date | null;
    let accountIds: (string | undefined)[];
    let metaLoginUserId: string | null = null;
    if (unifiedLogin) {
      // The code already yields the final token. Its lifetime comes from the
      // login configuration, so read it rather than assume one; failing to
      // read it only costs the expiry date shown in Settings.
      accessToken = codeToken;
      let tokenInfo: UnifiedTokenInfo | null = null;
      let tokenInfoFailure: string | null = null;
      try {
        tokenInfo = await getUnifiedTokenInfo(accessToken, requireMetaAppId(), requireSecret("FACEBOOK_APP_SECRET"));
      } catch (detailsError) {
        console.warn("[Instagram Callback] Token details unknown:", detailsError);
        tokenInfoFailure = detailsError instanceof Error ? detailsError.message.slice(0, 300) : "Unknown error";
      }
      // What Meta says about the token, for the admin's Diagnostics. Nothing is
      // decided on its `scopes`: a system user token can leave out a
      // permission that works (business_management). The calls below are the test.
      await recordTokenReport(state.workspaceId, tokenInfo, tokenInfoFailure);
      tokenExpiresAt = tokenInfo?.expiresAt ?? null;
      metaLoginUserId = tokenInfo?.userId ?? null;
      // One Unified login can grant several Instagram accounts; connect each.
      // Empty list → no_account; refused for lack of permission → missing_permissions.
      accountIds = (await requiring("business_management", () => getAssignedInstagramAccounts(accessToken))).map(
        (account) => account.id
      );
    } else {
      // Instagram Login, unchanged: swap for a 60-day token, one account (me).
      const longLived = await getLongLivedToken(codeToken);
      accessToken = longLived.accessToken;
      tokenExpiresAt = new Date(Date.now() + longLived.expiresIn * 1000);
      accountIds = [undefined];
    }

    const auth = { accessToken, unifiedLogin };
    const metaLogin = unifiedLogin ? "UNIFIED" : "INSTAGRAM";
    const encryptedToken = encryptToken(accessToken);
    let connected = 0;
    let webhooksOff = false;
    // A new account beyond the client's limit is skipped (reconnecting one
    // it already has is always allowed).
    let limited = false;

    for (const accountId of accountIds) {
      const userInfo = await requiring(unifiedLogin ? "instagram_basic" : "instagram_business_basic", () => getUserInfo(auth, accountId));
      // Webhooks and the messaging API key off the professional account ID
      // (user_id), not the app-scoped `id`. Store user_id so comment webhooks
      // can be matched back to this account. Fall back to id if user_id is
      // ever absent.
      const instagramId = userInfo.user_id ?? userInfo.id;
      const connection = await canConnectInstagramAccount({
        workspaceId: state.workspaceId,
        instagramId,
      });
      if (!connection.allowed) continue;
      const alreadyHere = await prisma.instagramAccount.count({ where: { instagramId, workspaceId: state.workspaceId } });
      if (!alreadyHere && accountLimit !== null) {
        const current = await prisma.instagramAccount.count({ where: { workspaceId: state.workspaceId } });
        if (current >= accountLimit) {
          limited = true;
          continue;
        }
      }

      // Turn notifications on, ask Meta what it confirms for the account and
      // record both in the admin's Diagnostics (lib/instagram/webhook-check.ts).
      // Without the subscription Meta sends no comments or messages, so the
      // Accounts tab also shows it on the account.
      const check = await subscribeAndCheckWebhooks({ instagramId, username: userInfo.username, auth, workspaceId: state.workspaceId });
      const webhookSubscribed = check.subscribed === true;
      if (!webhookSubscribed) webhooksOff = true;

      const data = {
        username: userInfo.username,
        name: userInfo.name,
        accessToken: encryptedToken,
        tokenExpiresAt,
        tokenInvalidAt: null,
        webhookSubscribed,
        // Reconnecting an Instagram Login account through Unified login (or
        // back) moves it to the new token's host.
        metaLogin,
        // Kept for Meta's data deletion / deauthorize callbacks, which may
        // identify the user by another id than the professional account id.
        instagramScopedId: userInfo.id === instagramId ? null : userInfo.id,
        metaLoginUserId,
      } as const;
      const existing = await prisma.instagramAccount.findUnique({ where: { instagramId } });
      if (existing) {
        const updated = await prisma.instagramAccount.updateMany({
          where: { id: existing.id, workspaceId: state.workspaceId, provider: 'META' }, data,
        });
        if (!updated.count) continue;
      } else {
        await prisma.instagramAccount.create({ data: { ...data, workspaceId: state.workspaceId, instagramId, provider: 'META' } });
      }
      connected++;
    }

    if (limited) {
      return back(`instagram=limit&max=${accountLimit}&connected=${connected}`);
    }
    if (!connected) {
      return back("instagram=already_connected");
    }

    return back(webhooksOff ? "instagram=connected&webhooks=off" : "instagram=connected");
  } catch (err) {
    if (err instanceof NoInstagramAccountError) return back("instagram=no_account");
    if (err instanceof MissingPermissionError) {
      // Meta's own answer to an essential call: the Accounts tab names the
      // permission; Meta's text goes to the admin's Diagnostics.
      await prisma.operationalEvent
        .create({
          data: {
            source: "SYSTEM",
            level: "ERROR",
            workspaceId: state.workspaceId,
            message: `Instagram connection refused by Meta: missing ${err.permission}`,
            payload: { permission: err.permission, reason: err.metaError.message.slice(0, 300) },
          },
        })
        .catch(() => {});
      return back(`instagram=missing_permissions&missing=${encodeURIComponent(err.permission)}`);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Instagram Callback] Error:", err);
    // The detail is for the operator (admin Diagnostics), not for the screen:
    // the person sees what to do next, never Meta's raw error.
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "Instagram connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});

    return back("instagram=failed");
  }
}

/**
 * Records, on every Unified login, what Meta's debug_token reported about the
 * token: type, validity, expiry, scopes and granular_scopes, and which
 * requested permissions its scopes leave out. Never the token. Shown in the
 * admin's Diagnostics (Operational Event Timeline).
 */
async function recordTokenReport(workspaceId: string, info: UnifiedTokenInfo | null, failure: string | null) {
  const report = info?.report;
  await prisma.operationalEvent
    .create({
      data: report
        ? {
            source: "SYSTEM",
            level: "INFO",
            workspaceId,
            message: `Instagram login: Meta's debug_token reports scopes: ${report.scopes.join(", ") || "(none)"}`,
            payload: { ...report, notInScopes: missingPermissions(report.scopes) },
          }
        : {
            source: "SYSTEM",
            level: "WARNING",
            workspaceId,
            message: "Instagram login: Meta's debug_token could not be read",
            payload: { reason: failure ?? "Unknown error" },
          },
    })
    .catch(() => {});
}
