/**
 * Cloudflare Turnstile (bot check on the public sign-up form).
 *
 * The site key is read at request time by the server and handed to the page,
 * so it is a runtime variable (no rebuild needed to change it). Without the
 * keys, sign-up is closed in production rather than open to bots; in
 * development and tests the check is skipped.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY?.trim() || null;
}

function secretKey(): string | null {
  return process.env.TURNSTILE_SECRET_KEY?.trim() || null;
}

function enforced(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Sign-up can be offered: Turnstile keys configured (or not in production),
 * and ALLOWED_EMAILS unset — with an allow-list, new sign-ups could never
 * sign in, so the operator clearly wants a closed instance.
 */
export function isSignupAvailable(): boolean {
  if ((process.env.ALLOWED_EMAILS ?? "").trim()) return false;
  return Boolean(turnstileSiteKey() && secretKey()) || !enforced();
}

export async function verifyTurnstile(token: unknown, ip: string | null): Promise<boolean> {
  const secret = secretKey();
  if (!secret) return !enforced();
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("[turnstile] Verification failed:", (err as Error).message);
    return false;
  }
}
