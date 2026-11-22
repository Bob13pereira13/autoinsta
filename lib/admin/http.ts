import { NextResponse } from "next/server";
import { AdminError } from "@/lib/admin/clients";
import { adminForbidden, getAdminEmail } from "@/lib/admin/auth";

/** Runs an admin API handler: 403 unless the caller is in ADMIN_EMAILS. */
export async function withAdmin(handler: (adminEmail: string) => Promise<unknown>): Promise<NextResponse> {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return adminForbidden();
  try {
    const data = await handler(adminEmail);
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof AdminError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    throw err;
  }
}
