import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized, isAuthorizedCronRequest } from "@/lib/cron-auth";
import { prisma } from "@/lib/db/client";
import { refreshExpiringTokens } from "@/lib/meta/token-refresh";

/**
 * Daily job: refreshes every Instagram token that has 15 days or less left
 * (i.e. tokens 45+ days old), and resets the monthly DM counters.
 * See lib/meta/token-refresh.ts for why it runs every day.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return cronUnauthorized();
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const usageReset = await prisma.workspace.updateMany({
    where: { usagePeriodStart: { lt: monthStart } },
    data: {
      usagePeriodStart: monthStart,
      dmsSentThisPeriod: 0,
    },
  });

  const results = await refreshExpiringTokens(now);

  return NextResponse.json({
    success: true,
    data: {
      totalProcessed: results.length,
      workspacesReset: usageReset.count,
      results,
    },
  });
}
