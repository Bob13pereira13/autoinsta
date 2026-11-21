import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized, isAuthorizedCronRequest } from "@/lib/cron-auth";
import { purgeExpiredData } from "@/lib/privacy/purge";

/**
 * Daily: deletes webhook payloads and logs past their retention period and
 * retries data deletion requests that failed. See lib/privacy/retention.ts.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }

  const data = await purgeExpiredData();
  return NextResponse.json({ success: true, data });
}
