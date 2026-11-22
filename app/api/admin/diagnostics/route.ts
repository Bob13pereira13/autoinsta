import { NextRequest } from "next/server";
import { getDiagnostics } from "@/lib/admin/diagnostics";
import { withAdmin } from "@/lib/admin/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Production diagnostics, for ADMIN_EMAILS only (403 for everyone else):
 * every client's events, or one client's with ?workspaceId=.
 */
export async function GET(request: NextRequest) {
  return withAdmin(() => getDiagnostics({ workspaceId: request.nextUrl.searchParams.get("workspaceId") }));
}
