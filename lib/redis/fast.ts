import Redis from "ioredis";

/**
 * A Redis connection for request-path checks (login and sign-up limits) that
 * fails fast. The queue connection is configured for BullMQ
 * (maxRetriesPerRequest: null), which would make a request hang for as long as
 * Redis is down. With the offline queue off, commands sent before the socket is
 * ready fail — so the first use awaits the connection instead of silently
 * skipping the limit on every cold start.
 */
let connecting: Promise<Redis> | null = null;

export function getFastRedis(): Promise<Redis> {
  connecting ??= (async () => {
    const client = new Redis(process.env.REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
    client.on("error", (err) => console.error("[redis-fast] Redis error:", err.message));
    await client.connect();
    return client;
  })().catch((err) => {
    connecting = null;
    throw err;
  });
  return connecting;
}
