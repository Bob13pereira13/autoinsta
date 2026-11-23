import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { effectiveAccountLimit, getDefaultAccountLimit } from "@/lib/account-limit";
import { getBaseUrl } from "@/lib/env";
import { canConnectInstagramAccount } from "@/lib/instagram-accounts";
import { getLongLivedToken, getUserInfo } from "@/lib/meta/client";
import {
  encryptToken,
  exchangeCodeForToken,
  verifyOAuthState,
} from "@/lib/meta/oauth";
import { missingPermissions, normalizeGranted } from "@/lib/meta/permissions";
import { MissingPermissionError, requiring } from "@/lib/meta/permission-errors";
import { subscribeAndCheckWebhooks } from "@/lib/instagram/webhook-check";
import { canManageWorkspace } from "@/lib/workspace-access";

/**
 * Where Meta's login comes back. Every outcome ends on the Accounts tab with a
 * code the page explains (components/instagram-connect-notice.tsx), and the
 * person can try again from there; nothing here answers with an error page.
 *   denied              the person cancelled the login
 *   missing_permissions a permission was turned off on Instagram's screen (the
 *                       granted list says so), or Meta refused an essential call
 *                       for lack of one (code 10 or 200–299); &missing= names it
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
    // Business Login for Instagram: the code gives a short-lived token, the
    // app-scoped user id and the permissions the person left on.
    const { accessToken: codeToken, permissions } = await exchangeCodeForToken(code, redirectUri);
    const granted = normalizeGranted(permissions);
    const missing = missingPermissions(granted);
    await recordGrantedPermissions(state.workspaceId, granted, missing);
    // A permission turned off on Instagram's screen: nothing is connected and
    // the Accounts tab says which one and how to try again.
    if (missing.length) {
      return back(`instagram=missing_permissions&missing=${encodeURIComponent(missing.join(","))}`);
    }

    // Swap for a 60-day token (renewed by the daily routine).
    const longLived = await getLongLivedToken(codeToken);
    const accessToken = longLived.accessToken;
    const tokenExpiresAt = new Date(Date.now() + longLived.expiresIn * 1000);
    const auth = { accessToken };
    const metaLogin = "INSTAGRAM";

    // One login, one Instagram professional account (me).
    const userInfo = await requiring("instagram_business_basic", () => getUserInfo(auth));
    // Webhooks and the messaging API key off the professional account ID
    // (user_id: the `id` Meta puts in every webhook for this account), not
    // the app-scoped `id` of /me. Stored as instagramId so webhooks and the
    // receipts match the account. Fall back to id if user_id is ever absent.
    const instagramId = userInfo.user_id ?? userInfo.id;
    const connection = await canConnectInstagramAccount({
      workspaceId: state.workspaceId,
      instagramId,
    });
    if (!connection.allowed) return back("instagram=already_connected");
    // A new account beyond the client's limit is refused (reconnecting one it
    // already has is always allowed).
    const alreadyHere = await prisma.instagramAccount.count({ where: { instagramId, workspaceId: state.workspaceId } });
    if (!alreadyHere && accountLimit !== null) {
      const current = await prisma.instagramAccount.count({ where: { workspaceId: state.workspaceId } });
      if (current >= accountLimit) return back(`instagram=limit&max=${accountLimit}&connected=0`);
    }

    // Turn notifications on, ask Meta what it confirms for the account and
    // record both in the admin's Diagnostics (lib/instagram/webhook-check.ts).
    // Without the subscription Meta sends no comments or messages, so the
    // Accounts tab also shows it on the account.
    const check = await subscribeAndCheckWebhooks({ instagramId, username: userInfo.username, auth, workspaceId: state.workspaceId });
    const webhookSubscribed = check.subscribed === true;

    const data = {
      username: userInfo.username,
      name: userInfo.name,
      accessToken: encryptToken(accessToken),
      tokenExpiresAt,
      tokenInvalidAt: null,
      webhookSubscribed,
      // An account connected before through the Facebook (Unified) login
      // moves to this login's token and host, automations kept.
      metaLogin,
      // Kept for Meta's data deletion / deauthorize callbacks, which may
      // identify the user by the app-scoped id rather than the professional
      // account id.
      instagramScopedId: userInfo.id === instagramId ? null : userInfo.id,
      metaLoginUserId: null,
    } as const;
    const existing = await prisma.instagramAccount.findUnique({ where: { instagramId } });
    if (existing) {
      const updated = await prisma.instagramAccount.updateMany({
        where: { id: existing.id, workspaceId: state.workspaceId, provider: "META" },
        data,
      });
      if (!updated.count) return back("instagram=already_connected");
    } else {
      await prisma.instagramAccount.create({ data: { ...data, workspaceId: state.workspaceId, instagramId, provider: "META" } });
    }

    return back(webhookSubscribed ? "instagram=connected" : "instagram=connected&webhooks=off");
  } catch (err) {
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
 * Records, on every connection, the permissions the person left on in
 * Instagram's screen (from the token exchange) and which requested ones are
 * missing. Shown in the admin's Diagnostics. Never the token.
 */
async function recordGrantedPermissions(workspaceId: string, granted: string[], missing: string[]) {
  await prisma.operationalEvent
    .create({
      data: {
        source: "SYSTEM",
        level: missing.length ? "WARNING" : "INFO",
        workspaceId,
        message: `Instagram login: permissions granted: ${granted.join(", ") || "(none reported)"}`,
        payload: { granted, missing },
      },
    })
    .catch(() => {});
}
