import { NextRequest, NextResponse } from "next/server";
import { registerSignup } from "@/lib/account/signup";
import { getClientIp } from "@/lib/http/client-ip";

export const runtime = "nodejs";

/** Public sign-up. The answer never says whether the e-mail already exists. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = await registerSignup(body, { ip: getClientIp(request.headers) });
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error, field: result.field ?? null }, { status: result.status });
  }
  return NextResponse.json({ success: true });
}
