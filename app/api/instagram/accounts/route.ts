import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getWorkspaceAccountLimit } from "@/lib/account-limit";
import { removeInstagramAccounts } from "@/lib/instagram/remove-account";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";

export const runtime = "nodejs";

/**
 * The workspace's connected Instagram accounts (Accounts tab, account
 * selectors). A single indexed query, unlike /api/dashboard/stats.
 *
 * PATCH ?id=  { automationsEnabled }  turns every automation of the account
 *             off or back on without deleting anything.
 * DELETE ?id= removes the account for good (automations, history, links).
 * Both are for owners and admins only.
 */
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const [instagramAccounts, limit] = await Promise.all([prisma.instagramAccount.findMany({
    where: { workspaceId: context.workspaceId },
    orderBy: { connectedAt: "desc" },
    select: {
      id: true,
      username: true,
      instagramId: true,
      name: true,
      automationsEnabled: true,
      tokenInvalidAt: true,
      tokenExpiresAt: true,
      connectedAt: true,
      _count: { select: { automations: true } },
    },
  }),
  getWorkspaceAccountLimit(context.workspaceId)]);

  return NextResponse.json({
    success: true,
    data: {
      instagramAccounts: instagramAccounts.map(({ _count, ...account }) => ({
        ...account,
        automationCount: _count.automations,
      })),
      selectedInstagramAccountId: instagramAccounts[0]?.id ?? null,
      canManage: canManageWorkspace(context.role),
      // How many accounts this client may connect: its own limit or the
      // platform default; null = no limit.
      accountLimit: limit.effective,
    },
  });
}

/** The account named by ?id=, if the caller may manage it; else the error response. */
async function managedAccount(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can manage Instagram accounts" },
      { status: 403 }
    );
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing account ID" }, { status: 400 });
  }
  const account = await prisma.instagramAccount.findFirst({
    where: { id, workspaceId: context.workspaceId },
    select: { id: true, automationsEnabled: true },
  });
  if (!account) {
    return NextResponse.json({ success: false, error: "Instagram account not found" }, { status: 404 });
  }
  return { context, account };
}

const patchSchema = z.object({ automationsEnabled: z.boolean() }).strict();

export async function PATCH(request: NextRequest) {
  const found = await managedAccount(request);
  if (found instanceof NextResponse) return found;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  }
  const { automationsEnabled } = parsed.data;
  const updated = await prisma.instagramAccount.update({
    where: { id: found.account.id },
    data: {
      automationsEnabled,
      // Turning it back on: comments made while it was off stay ignored (the
      // reconciler only answers comments made after this moment).
      ...(automationsEnabled && !found.account.automationsEnabled ? { automationsResumedAt: new Date() } : {}),
    },
    select: { id: true, automationsEnabled: true, automationsResumedAt: true },
  });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(request: NextRequest) {
  const found = await managedAccount(request);
  if (found instanceof NextResponse) return found;
  await removeInstagramAccounts(found.context.workspaceId, [found.account.id]);
  return NextResponse.json({ success: true });
}
