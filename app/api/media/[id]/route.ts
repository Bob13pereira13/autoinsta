import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { deleteMediaFiles } from "@/lib/media/storage";

/** Remove one uploaded file (and its record) from this workspace. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json({ success: false, error: "Only owners and admins can upload media" }, { status: 403 });
  }
  const { id } = await params;
  const media = await prisma.automationMedia.findFirst({
    where: { id, workspaceId: context.workspaceId },
    select: { id: true, storageKey: true },
  });
  if (!media) return NextResponse.json({ success: false, error: "Media not found" }, { status: 404 });

  await prisma.automationMedia.delete({ where: { id: media.id } });
  await deleteMediaFiles([media.storageKey]);
  return NextResponse.json({ success: true });
}
