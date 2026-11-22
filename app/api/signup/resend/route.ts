import { NextRequest, NextResponse } from "next/server";
import { resendConfirmation } from "@/lib/account/signup";
import { getClientIp } from "@/lib/http/client-ip";

export const runtime = "nodejs";

/** Resend the confirmation link. Same answer whether or not the e-mail exists. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = await resendConfirmation(body?.email, { ip: getClientIp(request.headers) });
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error, field: result.field ?? null }, { status: result.status });
  }
  return NextResponse.json({ success: true });
}
