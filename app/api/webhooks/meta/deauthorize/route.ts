import { NextRequest, NextResponse } from "next/server";
import { parseSignedRequest, readSignedRequestFromBody } from "@/lib/meta/signed-request";
import { revokeInstagramAccess } from "@/lib/privacy/data-deletion";

/**
 * Meta Deauthorize Callback — called when a user removes the app from their
 * Instagram account (Settings → Apps and websites).
 *
 * Configure in the Meta App Dashboard → Instagram → API setup with Instagram
 * login → "Deauthorize callback URL":
 *   https://<your-domain>/api/webhooks/meta/deauthorize
 */
export async function POST(request: NextRequest) {
  const signedRequest = await readSignedRequestFromBody(request);

  let parsed;
  try {
    parsed = parseSignedRequest(signedRequest);
  } catch (err) {
    console.error("[Deauthorize] Misconfigured:", err);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.reason }, { status: 400 });
  }

  const accounts = await revokeInstagramAccess(parsed.payload.user_id);
  return NextResponse.json({ success: true, accounts });
}
