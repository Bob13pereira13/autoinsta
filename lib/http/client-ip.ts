/**
 * The visitor's IP for rate limits.
 *
 * The app sits behind Coolify's Traefik with nothing else in front (DNS points
 * straight at the VPS). Traefik appends the address it received the request
 * from to X-Forwarded-For, so the LAST entry is the only one the visitor
 * cannot choose: anything before it was sent by the client and can be forged.
 * CF-Connecting-IP and X-Real-IP are ignored for the same reason (there is no
 * Cloudflare proxy to set them).
 */
const IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

export function getClientIp(headers: Headers): string | null {
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const last = entries[entries.length - 1];
  return last && IP_PATTERN.test(last) ? last : null;
}
