import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";

/**
 * The admin area is for the operator e-mails in ADMIN_EMAILS only. Every admin
 * page and API calls this on the server; proxy.ts also answers 403 before the
 * request reaches them.
 */
export async function getAdminEmail(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  return email && isPlatformAdmin(email) ? email.toLowerCase() : null;
}

export function adminForbidden() {
  return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
}
