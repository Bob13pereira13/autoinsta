import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { deleteMediaFiles, mediaKeysForAccounts } from "@/lib/media/storage";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

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

  const accounts = await prisma.instagramAccount.findMany({
    where: {
      workspaceId: context.workspaceId,
      ...(instagramAccountId ? { id: instagramAccountId } : {}),
    },
    select: { id: true, instagramId: true },
  });
  // Disconnecting deletes the account's automations (cascade); their media
  // files and the bot-message bookkeeping go with them.
  const mediaKeys = await mediaKeysForAccounts(accounts.map((a) => a.id));

  await prisma.instagramAccount.deleteMany({
    where: { id: { in: accounts.map((a) => a.id) }, workspaceId: context.workspaceId },
  });
  await prisma.botMessage.deleteMany({
    where: { instagramId: { in: accounts.map((a) => a.instagramId) } },
  });
  await deleteMediaFiles(mediaKeys);

  return NextResponse.json({ success: true });
}
