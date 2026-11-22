import { createHash } from "crypto";
import { getFastRedis } from "@/lib/redis/fast";

/**
 * Fixed-window counter in Redis: returns whether this hit is still within
 * `max` per `windowSeconds`. Keys are hashed so no e-mail or IP is stored in
 * Redis in clear. If Redis is unreachable the check fails open (logs and
 * allows): the sign-up form is also behind Turnstile, and locking everyone out
 * because of a cache outage would be worse.
 */
export async function hitRateLimit(scope: string, subject: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const key = `rl:${scope}:${createHash("sha256").update(subject).digest("hex")}`;
    const redis = await getFastRedis();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return count <= max;
  } catch (err) {
    console.error(`[rate-limit] Redis unavailable, allowing ${scope}:`, (err as Error).message);
    return true;
  }
}
