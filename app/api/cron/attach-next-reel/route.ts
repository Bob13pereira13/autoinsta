import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized, isAuthorizedCronRequest } from "@/lib/cron-auth";
import { attachPendingNextReels } from "@/lib/automation/attach-next-reel";

/**
 * Binds "next reel" campaigns to a real post.
 *
 * Instagram sends no webhook when a new media is published, so we poll: for
 * every campaign awaiting the creator's next reel, find the earliest reel that
 * was posted after the campaign was created and attach the campaign to it.
 * Runs on a schedule (see vercel.json) — the campaign goes live within one
 * cron interval of the reel being posted.
 */

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }

  const result = await attachPendingNextReels();

  return NextResponse.json({
    success: true,
    data: result,
  });
}
