import { createHash } from "crypto";
import Redis from "ioredis";

/**
 * Failed-login throttling, per e-mail and per IP, in fixed 15-minute windows.
 * Only failures count, and a successful login clears the e-mail counter.
 *
 * If Redis is unreachable the check fails open (logs and allows): scrypt
 * already makes each guess expensive, and locking every customer out because
 * of a cache outage would be worse.
 */
// A dedicated connection that fails fast: the queue connection is configured
// for BullMQ (maxRetriesPerRequest: null), which would make a login hang for as
// long as Redis is down instead of failing open. With the offline queue off,
// commands sent before the socket is ready fail — so the first use awaits the
// connection instead of silently skipping the throttle on every cold start.
let connecting: Promise<Redis> | null = null;
function getRedisConnection(): Promise<Redis> {
  connecting ??= (async () => {
    const client = new Redis(process.env.REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
    client.on("error", (err) => console.error("[login-rate-limit] Redis error:", err.message));
    await client.connect();
    return client;
  })().catch((err) => {
    connecting = null;
    throw err;
  });
  return connecting;
}

export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 30;

function keys(email: string, ip: string | null) {
  const emailKey = `login:fail:email:${createHash("sha256").update(email).digest("hex")}`;
  const ipKey = ip ? `login:fail:ip:${createHash("sha256").update(ip).digest("hex")}` : null;
  return { emailKey, ipKey };
}

export async function isLoginBlocked(email: string, ip: string | null): Promise<boolean> {
  try {
    const { emailKey, ipKey } = keys(email, ip);
    const redis = await getRedisConnection();
    const [emailCount, ipCount] = await Promise.all([
      redis.get(emailKey),
      ipKey ? redis.get(ipKey) : Promise.resolve(null),
    ]);
    return (
      Number(emailCount ?? 0) >= MAX_FAILURES_PER_EMAIL ||
      Number(ipCount ?? 0) >= MAX_FAILURES_PER_IP
    );
  } catch (err) {
    console.error("[login-rate-limit] Redis unavailable, allowing attempt:", err);
    return false;
  }
}

export async function recordLoginFailure(email: string, ip: string | null): Promise<void> {
  try {
    const { emailKey, ipKey } = keys(email, ip);
    const redis = await getRedisConnection();
    for (const key of [emailKey, ipKey]) {
      if (!key) continue;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, LOGIN_WINDOW_SECONDS);
    }
  } catch (err) {
    console.error("[login-rate-limit] Could not record failure:", err);
  }
}

export async function clearLoginFailures(email: string): Promise<void> {
  try {
    await (await getRedisConnection()).del(keys(email, null).emailKey);
  } catch {
    // Best effort: the counter expires on its own.
  }
}

export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || null;
}
