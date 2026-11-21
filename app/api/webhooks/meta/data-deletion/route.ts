import { NextRequest, NextResponse } from "next/server";
import { parseSignedRequest, readSignedRequestFromBody } from "@/lib/meta/signed-request";
import { handleMetaDataDeletion } from "@/lib/privacy/data-deletion";

/**
 * Meta Data Deletion Request Callback.
 *
 * Configure in the Meta App Dashboard → Instagram → API setup with Instagram
 * login → "Data deletion request URL":
 *   https://<your-domain>/api/webhooks/meta/data-deletion
 *
 * Meta POSTs `signed_request` (form-encoded). We verify its HMAC-SHA256
 * signature with the app secret, delete the user's Instagram data and answer
 * with the JSON Meta requires: { url, confirmation_code }. The url opens
 * /exclusao-dados, where the user can check the status with that code.
 */
export async function POST(request: NextRequest) {
  const signedRequest = await readSignedRequestFromBody(request);

  let parsed;
  try {
    parsed = parseSignedRequest(signedRequest);
  } catch (err) {
    console.error("[Data Deletion] Misconfigured:", err);
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.reason }, { status: 400 });
  }

  const response = await handleMetaDataDeletion(parsed.payload.user_id);
  return NextResponse.json(response);
}
