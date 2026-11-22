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

/*
 * A wait before the DM (Automation.dmDelaySeconds) must not end with the bot
 * talking over a person from the team. The echo of a message the account sent
 * is only classified 20 s after it arrives (it waits for the bot's own mid to
 * be stored), so each echo is also noted here the moment it arrives, and the
 * delayed send looks at both.
 */
const ECHO_NOTE_TTL_SECONDS = 15 * 60;
const echoNoteKey = (accountConnectionId: string, recipientId: string) => `echoes:${accountConnectionId}:${recipientId}`;

/** Note an echo as it arrives (before it is classified). Best-effort. */
export async function noteEcho({
  accountConnectionId,
  recipientId,
  messageId,
  at = new Date(),
}: {
  accountConnectionId: string;
  recipientId: string;
  messageId: string;
  at?: Date;
}): Promise<void> {
  try {
    const redis = getRedisConnection();
    const key = echoNoteKey(accountConnectionId, recipientId);
    await redis.lpush(key, JSON.stringify({ mid: messageId, at: at.getTime() }));
    await redis.ltrim(key, 0, 49);
    await redis.expire(key, ECHO_NOTE_TTL_SECONDS);
  } catch (err) {
    console.warn("[guards] Could not note echo:", err instanceof Error ? err.message : err);
  }
}

/**
 * Did a person from the account message this recipient since `since` (when a
 * delayed DM was scheduled)? Classified echoes (ConversationActivity) and
 * echoes noted on arrival that are not one of the bot's own messages count.
 */
export async function humanRepliedSince({
  accountConnectionId,
  recipientId,
  since,
}: {
  accountConnectionId: string;
  recipientId: string;
  since: Date;
}): Promise<boolean> {
  const activity = await prisma.conversationActivity.findUnique({
    where: { instagramAccountId_recipientId: { instagramAccountId: accountConnectionId, recipientId } },
    select: { lastHumanMessageAt: true },
  });
  if (activity && activity.lastHumanMessageAt.getTime() >= since.getTime()) return true;

  let notes: Array<{ mid: string; at: number }> = [];
  try {
    const raw = await getRedisConnection().lrange(echoNoteKey(accountConnectionId, recipientId), 0, -1);
    notes = raw
      .map((entry) => {
        try {
          return JSON.parse(entry) as { mid: string; at: number };
        } catch {
          return null;
        }
      })
      .filter((n): n is { mid: string; at: number } => Boolean(n?.mid) && n!.at >= since.getTime());
  } catch {
    // Redis unavailable: the classified echoes above are all we have.
    return false;
  }
  if (!notes.length) return false;
  const bot = await prisma.botMessage.findMany({ where: { mid: { in: notes.map((n) => n.mid) } }, select: { mid: true } });
  const botMids = new Set(bot.map((b) => b.mid));
  return notes.some((n) => !botMids.has(n.mid));
}

