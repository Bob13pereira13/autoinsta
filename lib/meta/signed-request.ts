import { createHmac, timingSafeEqual } from "crypto";
import { getAppSecrets } from "@/lib/meta/webhook";

/**
 * Meta's `signed_request` format, used by the Data Deletion Request Callback
 * and the Deauthorize Callback:
 *
 *   <base64url(HMAC-SHA256(payload_part, app_secret))>.<base64url(JSON)>
 *
 * The HMAC is computed over the *encoded* payload part, exactly as received.
 * https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
export interface SignedRequestPayload {
  algorithm: string;
  user_id: string;
  issued_at?: number;
  expires?: number;
  [key: string]: unknown;
}

export type SignedRequestResult =
  | { ok: true; payload: SignedRequestPayload }
  | { ok: false; reason: "malformed" | "unsupported_algorithm" | "bad_signature" | "missing_user" };

function decodeBase64Url(value: string): Buffer {
  // Buffer accepts unpadded base64url; normalize the standard alphabet too.
  return Buffer.from(value.replace(/\+/g, "-").replace(/\//g, "_"), "base64url");
}

export function parseSignedRequest(
  signedRequest: string | null | undefined,
  secrets: string[] = getAppSecrets()
): SignedRequestResult {
  if (!signedRequest || typeof signedRequest !== "string") {
    return { ok: false, reason: "malformed" };
  }
  const parts = signedRequest.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }
  const [encodedSignature, encodedPayload] = parts;

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "malformed" };
  }

  if (String(payload.algorithm ?? "").toUpperCase() !== "HMAC-SHA256") {
    return { ok: false, reason: "unsupported_algorithm" };
  }

  if (secrets.length === 0) {
    throw new Error(
      "INSTAGRAM_APP_SECRET or FACEBOOK_APP_SECRET is required to verify signed requests"
    );
  }

  const signature = decodeBase64Url(encodedSignature);
  const valid = secrets.some((secret) => {
    const expected = createHmac("sha256", secret).update(encodedPayload).digest();
    return expected.length === signature.length && timingSafeEqual(expected, signature);
  });
  if (!valid) return { ok: false, reason: "bad_signature" };

  const userId = payload.user_id;
  if ((typeof userId !== "string" && typeof userId !== "number") || String(userId) === "") {
    return { ok: false, reason: "missing_user" };
  }

  return { ok: true, payload: { ...payload, user_id: String(userId) } };
}

/** Builds a signed_request the way Meta does. Used by tests and local checks. */
export function createSignedRequest(payload: Record<string, unknown>, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

/**
 * Reads `signed_request` from the callback body. Meta posts it as
 * application/x-www-form-urlencoded; JSON is accepted too for manual tests.
 */
export async function readSignedRequestFromBody(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  const raw = await request.text();
  if (contentType.includes("application/json")) {
    try {
      const body = JSON.parse(raw) as { signed_request?: unknown };
      return typeof body.signed_request === "string" ? body.signed_request : null;
    } catch {
      return null;
    }
  }
  return new URLSearchParams(raw).get("signed_request");
}
