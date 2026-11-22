import { NextRequest, NextResponse } from "next/server";
import { removeInstagramAccounts } from "@/lib/instagram/remove-account";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

/**
 * Legacy endpoint kept for compatibility; the Accounts tab uses
 * DELETE /api/instagram/accounts?id=. The account is required: a request
 * without it used to remove every account of the workspace.
 */
export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can disconnect accounts" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const instagramAccountId =
    typeof body.instagramAccountId === "string" ? body.instagramAccountId : null;
  if (!instagramAccountId) {
    return NextResponse.json(
      { success: false, error: "Missing account ID" },
      { status: 400 }
    );
  }

  const removed = await removeInstagramAccounts(context.workspaceId, [instagramAccountId]);
  if (!removed) {
    return NextResponse.json(
      { success: false, error: "Instagram account not found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true });
}
