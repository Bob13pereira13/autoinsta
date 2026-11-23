/**
 * A short record of every signed webhook POST from Meta, to tell "Meta does
 * not send it" from "the app discards it" (admin → Diagnostics). For each
 * entry: its id (the business account the notification is about), the keys
 * present (changes, messaging, standby…), the fields of `changes`, what kind of
 * `messaging` items came (message, echo, postback, read…), and whether it went
 * on to processing or was discarded and why. Never message text, never the
 * ids of people. Kept 24 hours.
 */
import { prisma } from "@/lib/db/client";

export const WEBHOOK_RECEIPT_HOURS = 24;

export type DiscardReason = "object_not_instagram" | "unknown_account" | "no_entry_id";

export interface EntrySummary {
  /** The entry's id: the business account (Instagram, or a Page for object "page"). */
  id: string | null;
  /** Keys present on the entry (names only). */
  keys: string[];
  /** `changes[].field` values. */
  fields: string[];
  /** Kinds of `messaging` items and how many: message, echo, postback, read, reaction… */
  messaging: Record<string, number>;
  /** Kinds of `standby` items (another app owns the conversation). */
  standby: Record<string, number>;
  /**
   * Business account ids inside `messaging` that differ from the entry id
   * (the recipient of an incoming message, the sender of an echo): evidence
   * for an id mismatch. Never a person's id.
   */
  otherBusinessIds: string[];
  accepted: boolean;
  reason: DiscardReason | null;
}

export interface ReceiptSummary {
  object: string | null;
  accepted: boolean;
  reason: "invalid_json" | "object_not_instagram" | "no_entries" | null;
  entries: EntrySummary[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const idOf = (v: unknown): string | null => (isObj(v) && (typeof v.id === "string" || typeof v.id === "number") ? String(v.id) : null);

/** What one messaging item is, by the keys it carries (never its content). */
function itemKind(item: Obj): string {
  const message = isObj(item.message) ? item.message : null;
  if (message) return message.is_echo ? "echo" : message.is_deleted ? "message_deleted" : "message";
  const kind = Object.keys(item).find((k) => !["sender", "recipient", "timestamp"].includes(k));
  return kind ?? "empty";
}

function countKinds(items: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(items)) return counts;
  for (const item of items) {
    if (!isObj(item)) continue;
    const kind = itemKind(item);
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

/** Summary of a parsed webhook body; `known` = the instagramIds of connected accounts. */
export function describeWebhook(payload: unknown, known: ReadonlySet<string>): ReceiptSummary {
  if (!isObj(payload)) return { object: null, accepted: false, reason: "invalid_json", entries: [] };
  const object = typeof payload.object === "string" ? payload.object : null;
  const rawEntries = Array.isArray(payload.entry) ? payload.entry.filter(isObj) : [];
  const isInstagram = object === "instagram";

  const entries: EntrySummary[] = rawEntries.map((entry) => {
    const id = idOf(entry);
    const messagingItems = Array.isArray(entry.messaging) ? entry.messaging.filter(isObj) : [];
    const otherBusinessIds = new Set<string>();
    for (const item of messagingItems) {
      const echo = isObj(item.message) && Boolean(item.message.is_echo);
      // The business side of the conversation: the sender of an echo, the
      // recipient of anything else.
      const business = idOf(echo ? item.sender : item.recipient);
      if (business && business !== id) otherBusinessIds.add(business);
    }
    const reason: DiscardReason | null = !isInstagram ? "object_not_instagram" : !id ? "no_entry_id" : known.has(id) ? null : "unknown_account";
    return {
      id,
      keys: Object.keys(entry).sort(),
      fields: Array.isArray(entry.changes)
        ? [...new Set(entry.changes.filter(isObj).map((c) => (typeof c.field === "string" ? c.field : "?")))]
        : [],
      messaging: countKinds(entry.messaging),
      standby: countKinds(entry.standby),
      otherBusinessIds: [...otherBusinessIds].slice(0, 5),
      accepted: reason === null,
      reason,
    };
  });

  const reason = !isInstagram ? "object_not_instagram" : entries.length === 0 ? "no_entries" : null;
  return { object, accepted: entries.some((e) => e.accepted), reason, entries };
}

let lastCleanup = 0;

/** Records the summary; never fails the webhook. Old receipts are cleared on the way (at most every 10 min). */
export async function recordWebhookReceipt(summary: ReceiptSummary, now = new Date()): Promise<void> {
  try {
    await prisma.webhookReceipt.create({
      data: { object: summary.object, accepted: summary.accepted, reason: summary.reason, entries: summary.entries as unknown as object[] },
    });
    if (now.getTime() - lastCleanup > 10 * 60 * 1000) {
      lastCleanup = now.getTime();
      await prisma.webhookReceipt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - WEBHOOK_RECEIPT_HOURS * 3600_000) } } });
    }
  } catch (error) {
    console.error("[webhook] Could not record the receipt:", error instanceof Error ? error.message : error);
  }
}
