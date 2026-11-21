import { NextRequest, NextResponse } from "next/server";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import {
  MAX_VIDEO_BYTES,
  MediaValidationError,
  storeUpload,
  workspaceMediaUsageBytes,
  workspaceQuotaBytes,
} from "@/lib/media/storage";
import { mediaPublicUrl } from "@/lib/media/urls";

// Not under proxy.ts's matcher on purpose: a proxied request body is buffered
// and silently truncated at 10 MB (proxyClientMaxBodySize), and videos go up
// to 25 MB.

/** Storage used by this workspace, for the editor's usage bar. */
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    success: true,
    data: {
      usedBytes: await workspaceMediaUsageBytes(context.workspaceId),
      quotaBytes: workspaceQuotaBytes(),
    },
  });
}

/** Upload one image or video (multipart field "file"). */
export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json({ success: false, error: "Only owners and admins can upload media" }, { status: 403 });
  }

  // Refuse obviously oversized bodies before reading them into memory.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_VIDEO_BYTES + 1024 * 1024) {
    return NextResponse.json({ success: false, error: "Videos can be at most 25 MB.", code: "video_too_large" }, { status: 413 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ success: false, error: "Invalid upload" }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ success: false, error: "Invalid upload" }, { status: 400 });
  }

  try {
    const media = await storeUpload({
      workspaceId: context.workspaceId,
      buffer: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
    });
    return NextResponse.json({
      success: true,
      data: {
        id: media.id,
        kind: media.kind,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
        originalName: media.originalName,
        url: mediaPublicUrl(media.storageKey),
      },
    });
  } catch (err) {
    if (err instanceof MediaValidationError) {
      const status = err.code === "quota_exceeded" || err.code.endsWith("too_large") ? 413 : 415;
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status });
    }
    console.error("[media] Upload failed:", err);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
