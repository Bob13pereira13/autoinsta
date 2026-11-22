import { prisma } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue/client";

/**
 * Guards for STORIES/DIRECT automations without keywords (they answer any
 * message, so they must not spam or talk over a person):
 * - cooldown: at most one automatic reply per person per automation every
 *   `replyCooldownHours` (default 24);
 * - human pause: no automatic reply when someone from the account (Instagram
 *   app or Business Suite) messaged that person in the last 24h.
 */
export const HUMAN_PAUSE_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

export function cooldownKey(automationId: string, recipientId: string): string {
  return `cooldown:${automationId}:${recipientId}`;
}

export type CooldownClaim =
  | { allowed: true; release: () => Promise<void> }
  | { allowed: false };

/**
 * Atomically claims the per-person cooldown. The database check survives a
 * Redis restart; the Redis SET NX stops two messages that arrive together
 * from both getting a reply. Call `release()` if the send then fails, so the
 * next message is not blocked by a reply that never went out.
 */
export async function claimReplyCooldown({
  automationId,
  recipientId,
  hours,
  excludeEventId,
  now = new Date(),
}: {
  automationId: string;
  recipientId: string;
  hours: number;
  /** The current event's own log id (commentId), ignored by the DB check. */
  excludeEventId?: string;
  now?: Date;
}): Promise<CooldownClaim> {
  const windowMs = Math.max(1, hours) * HOUR_MS;
  const recent = await prisma.dmLog.findFirst({
    where: {
      automationId,
      commenterId: recipientId,
      status: "SENT",
      dmSentAt: { gte: new Date(now.getTime() - windowMs) },
      ...(excludeEventId ? { commentId: { not: excludeEventId } } : {}),
    },
    select: { id: true },
  });
  if (recent) return { allowed: false };

  const redis = getRedisConnection();
  const key = cooldownKey(automationId, recipientId);
  const set = await redis.set(key, String(now.getTime()), "PX", windowMs, "NX");
  if (set !== "OK") return { allowed: false };
  return {
    allowed: true,
    release: async () => {
      await redis.del(key).catch(() => {});
    },
  };
}

/** True when a person from the account messaged this recipient recently. */
export async function isHumanConversationActive({
  accountConnectionId,
  recipientId,
  now = new Date(),
}: {
  accountConnectionId: string;
  recipientId: string;
  now?: Date;
}): Promise<boolean> {
  const activity = await prisma.conversationActivity.findUnique({
    where: { instagramAccountId_recipientId: { instagramAccountId: accountConnectionId, recipientId } },
    select: { lastHumanMessageAt: true },
  });
  return Boolean(
    activity && activity.lastHumanMessageAt.getTime() > now.getTime() - HUMAN_PAUSE_HOURS * HOUR_MS
  );
}

export async function recordHumanMessage({
  accountConnectionId,
  recipientId,
  at = new Date(),
}: {
  accountConnectionId: string;
  recipientId: string;
  at?: Date;
}): Promise<void> {
  await prisma.conversationActivity.upsert({
    where: { instagramAccountId_recipientId: { instagramAccountId: accountConnectionId, recipientId } },
    create: { instagramAccountId: accountConnectionId, recipientId, lastHumanMessageAt: at },
    update: { lastHumanMessageAt: at },
  });
}

/** Remember a message the automations sent, so its echo is not taken for a human. */
export async function recordBotMessage({
  messageId,
  instagramId,
  recipientId,
}: {
  messageId: string | null | undefined;
  instagramId: string;
  recipientId?: string | null;
}): Promise<void> {
  if (!messageId) return;
  try {
    await prisma.botMessage.upsert({
      where: { mid: messageId },
      create: { mid: messageId, instagramId, recipientId: recipientId ?? null },
      update: {},
    });
  } catch (err) {
    // Never fail a delivered send because of bookkeeping.
    console.warn("[guards] Could not record bot message:", err instanceof Error ? err.message : err);
  }
}

/**
 * Handle an echo webhook: if the mid is not one the automations sent, a
 * person wrote it. Processed with a short delay (see process-webhook) so the
 * worker has stored the mid of its own send before the echo is checked.
 */
export async function handleEcho({
  accountConnectionId,
  recipientId,
  messageId,
  at = new Date(),
}: {
  accountConnectionId: string;
  recipientId: string;
  messageId: string;
  at?: Date;
}): Promise<"bot" | "human"> {
  const bot = await prisma.botMessage.findUnique({ where: { mid: messageId }, select: { mid: true } });
  if (bot) return "bot";
  await recordHumanMessage({ accountConnectionId, recipientId, at });
  return "human";
}
