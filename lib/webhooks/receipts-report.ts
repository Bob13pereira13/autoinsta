/**
 * The admin's view of the last 24 hours of webhook receipts
 * (lib/webhooks/receipts.ts): how many arrived, what kinds of notifications
 * (comments, messages, echoes…), what was discarded and why, and, for entry
 * ids that match no connected account, what arrived and a proposed mapping.
 * Nothing is changed: the proposal is for a person to decide.
 */
import type { DiscardReason, EntrySummary } from "./receipts";

export interface ReceiptRow {
  id: string;
  createdAt: Date;
  object: string | null;
  accepted: boolean;
  reason: string | null;
  entries: unknown;
}

export interface AccountRow {
  username: string;
  instagramId: string;
  instagramScopedId: string | null;
  metaLoginUserId: string | null;
  client: string | null;
}

export interface UnknownEntry {
  object: string | null;
  id: string;
  reason: DiscardReason;
  count: number;
  firstAt: Date;
  lastAt: Date;
  keys: string[];
  fields: string[];
  messaging: Record<string, number>;
  otherBusinessIds: string[];
  /** A connected account this id probably is, and why; null when nothing matches. */
  proposal: { username: string; instagramId: string; client: string | null; why: "business_id_inside" | "app_scoped_id" | "login_user_id" } | null;
}

export interface ReceiptsReport {
  total: number;
  accepted: number;
  discarded: number;
  discardedBy: Record<string, number>;
  /** Kinds that arrived at all (accepted or not): changes fields and messaging kinds. */
  arrived: { fields: Record<string, number>; messaging: Record<string, number> };
  /** The same, only from entries that went on to processing. */
  acceptedKinds: { fields: Record<string, number>; messaging: Record<string, number> };
  /** Did any message notification arrive, and was it accepted? */
  messages: "none" | "accepted" | "discarded_only" | "some_discarded";
  unknown: UnknownEntry[];
  recent: Array<{ id: string; createdAt: Date; object: string | null; accepted: boolean; reason: string | null; entries: EntrySummary[] }>;
}

const MESSAGE_KINDS = new Set(["message", "echo", "message_deleted", "postback", "reaction", "referral"]);
const add = (into: Record<string, number>, key: string, n = 1) => void (into[key] = (into[key] ?? 0) + n);

function entriesOf(value: unknown): EntrySummary[] {
  return Array.isArray(value) ? (value as EntrySummary[]) : [];
}

export function buildReceiptsReport(rows: ReceiptRow[], accounts: AccountRow[], recentLimit = 30): ReceiptsReport {
  const report: ReceiptsReport = {
    total: rows.length,
    accepted: 0,
    discarded: 0,
    discardedBy: {},
    arrived: { fields: {}, messaging: {} },
    acceptedKinds: { fields: {}, messaging: {} },
    messages: "none",
    unknown: [],
    recent: [],
  };
  const unknown = new Map<string, UnknownEntry>();
  let acceptedMessages = 0;
  let discardedMessages = 0;

  for (const row of rows) {
    if (row.accepted) report.accepted++;
    else {
      report.discarded++;
      add(report.discardedBy, row.reason ?? entriesOf(row.entries).find((e) => e.reason)?.reason ?? "unknown");
    }
    for (const entry of entriesOf(row.entries)) {
      for (const field of entry.fields ?? []) {
        add(report.arrived.fields, field);
        if (entry.accepted) add(report.acceptedKinds.fields, field);
      }
      for (const [kind, n] of Object.entries(entry.messaging ?? {})) {
        add(report.arrived.messaging, kind, n);
        if (entry.accepted) add(report.acceptedKinds.messaging, kind, n);
        if (MESSAGE_KINDS.has(kind)) {
          if (entry.accepted) acceptedMessages += n;
          else discardedMessages += n;
        }
      }
      // Some setups deliver messages as changes with field "messages".
      if ((entry.fields ?? []).includes("messages")) {
        if (entry.accepted) acceptedMessages++;
        else discardedMessages++;
      }
      if (!entry.accepted && entry.id && entry.reason) {
        const key = `${row.object ?? ""}:${entry.id}`;
        const seen = unknown.get(key) ?? {
          object: row.object,
          id: entry.id,
          reason: entry.reason,
          count: 0,
          firstAt: row.createdAt,
          lastAt: row.createdAt,
          keys: [],
          fields: [],
          messaging: {},
          otherBusinessIds: [],
          proposal: null,
        };
        seen.count++;
        if (row.createdAt < seen.firstAt) seen.firstAt = row.createdAt;
        if (row.createdAt > seen.lastAt) seen.lastAt = row.createdAt;
        seen.keys = [...new Set([...seen.keys, ...(entry.keys ?? [])])];
        seen.fields = [...new Set([...seen.fields, ...(entry.fields ?? [])])];
        for (const [kind, n] of Object.entries(entry.messaging ?? {})) add(seen.messaging, kind, n);
        seen.otherBusinessIds = [...new Set([...seen.otherBusinessIds, ...(entry.otherBusinessIds ?? [])])].slice(0, 5);
        unknown.set(key, seen);
      }
    }
  }

  report.messages =
    acceptedMessages === 0 && discardedMessages === 0
      ? "none"
      : discardedMessages === 0
        ? "accepted"
        : acceptedMessages === 0
          ? "discarded_only"
          : "some_discarded";

  const byInstagramId = new Map(accounts.map((a) => [a.instagramId, a]));
  for (const entry of unknown.values()) {
    // 1. The messages inside name a connected account as the business side.
    const inside = entry.otherBusinessIds.map((id) => byInstagramId.get(id)).find(Boolean);
    const scoped = accounts.find((a) => a.instagramScopedId === entry.id);
    const loginUser = accounts.find((a) => a.metaLoginUserId === entry.id);
    const match = inside ? { account: inside, why: "business_id_inside" as const } : scoped ? { account: scoped, why: "app_scoped_id" as const } : loginUser ? { account: loginUser, why: "login_user_id" as const } : null;
    entry.proposal = match ? { username: match.account.username, instagramId: match.account.instagramId, client: match.account.client, why: match.why } : null;
  }
  report.unknown = [...unknown.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  report.recent = rows.slice(0, recentLimit).map((row) => ({ ...row, entries: entriesOf(row.entries) }));
  return report;
}
